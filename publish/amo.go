package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// Firefox AMO API v5, per
// https://mozilla.github.io/addons-server/topics/api/addons.html: upload the
// zip, poll until validation finishes, then create the version on the
// add-on, which submits it for review. Auth is a short-lived HMAC-SHA256
// JWT per https://mozilla.github.io/addons-server/topics/api/auth.html.
const (
	defaultAMOAPIBase = "https://addons.mozilla.org"
	amoMaxPolls       = 60
)

type amoStore struct {
	client       *http.Client
	apiBase      string
	creds        credentials
	now          func() time.Time
	pollInterval time.Duration
}

func newAMOStore(client *http.Client, creds credentials) amoStore {
	return amoStore{
		client:       client,
		apiBase:      defaultAMOAPIBase,
		creds:        creds,
		now:          time.Now,
		pollInterval: 5 * time.Second,
	}
}

func (s amoStore) run(zipPath, channel string) error {
	if s.creds.AMOJWTIssuer == "" || s.creds.AMOJWTSecret == "" ||
		s.creds.AMOAddonID == "" {
		return errors.New("firefox: missing credentials (jwt issuer, jwt secret, addon id)")
	}
	if channel != "listed" && channel != "unlisted" {
		return fmt.Errorf("firefox: channel %q, want listed or unlisted", channel)
	}
	uuid, err := s.upload(zipPath, channel)
	if err != nil {
		return fmt.Errorf("firefox upload: %w", err)
	}
	if waitErr := s.waitProcessed(uuid); waitErr != nil {
		return fmt.Errorf("firefox validation: %w", waitErr)
	}
	if versionErr := s.createVersion(uuid); versionErr != nil {
		return fmt.Errorf("firefox version: %w", versionErr)
	}
	log.Println("firefox: uploaded and submitted for review")
	return nil
}

// token builds a fresh JWT per request. AMO caps expiry at five minutes
// past iat; iat is backdated a few seconds to survive clock skew.
func (s amoStore) token() (string, error) {
	jti := make([]byte, 16)
	if _, err := rand.Read(jti); err != nil {
		return "", err
	}
	issued := s.now().Unix()
	claims, err := json.Marshal(map[string]any{
		"iss": s.creds.AMOJWTIssuer,
		"jti": hex.EncodeToString(jti),
		"iat": issued - 5,
		"exp": issued + 60,
	})
	if err != nil {
		return "", err
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString(claims)
	mac := hmac.New(sha256.New, []byte(s.creds.AMOJWTSecret))
	_, _ = mac.Write([]byte(header + "." + payload)) // hash.Hash.Write never returns an error
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return header + "." + payload + "." + signature, nil
}

func (s amoStore) doAuthed(method, apiURL string, body io.Reader, contentType string) ([]byte, error) {
	req, err := http.NewRequest(method, apiURL, body)
	if err != nil {
		return nil, err
	}
	token, err := s.token()
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "JWT "+token)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	return doRequest(s.client, req)
}

func amoUploadBody(zipPath, channel string) (*bytes.Buffer, string, error) {
	file, err := os.Open(zipPath) // #nosec G304 -- the operator names the zip to upload deliberately
	if err != nil {
		return nil, "", err
	}
	defer func() {
		_ = file.Close() // read-only handle; a close error carries no information
	}()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("upload", filepath.Base(zipPath))
	if err != nil {
		return nil, "", err
	}
	if _, copyErr := io.Copy(part, file); copyErr != nil {
		return nil, "", copyErr
	}
	if fieldErr := writer.WriteField("channel", channel); fieldErr != nil {
		return nil, "", fieldErr
	}
	if closeErr := writer.Close(); closeErr != nil {
		return nil, "", closeErr
	}
	return &body, writer.FormDataContentType(), nil
}

func (s amoStore) upload(zipPath, channel string) (string, error) {
	body, contentType, err := amoUploadBody(zipPath, channel)
	if err != nil {
		return "", err
	}
	data, err := s.doAuthed(http.MethodPost, s.apiBase+"/api/v5/addons/upload/", body, contentType)
	if err != nil {
		return "", err
	}
	var parsed struct {
		UUID string `json:"uuid"`
	}
	if jsonErr := json.Unmarshal(data, &parsed); jsonErr != nil {
		return "", jsonErr
	}
	if parsed.UUID == "" {
		return "", fmt.Errorf("upload response missing uuid: %s", data)
	}
	return parsed.UUID, nil
}

func (s amoStore) waitProcessed(uuid string) error {
	statusURL := s.apiBase + "/api/v5/addons/upload/" + uuid + "/"
	for attempt := range amoMaxPolls {
		if attempt > 0 {
			time.Sleep(s.pollInterval)
		}
		data, err := s.doAuthed(http.MethodGet, statusURL, nil, "")
		if err != nil {
			return err
		}
		var parsed struct {
			Processed  bool            `json:"processed"`
			Valid      bool            `json:"valid"`
			Validation json.RawMessage `json:"validation"`
		}
		if jsonErr := json.Unmarshal(data, &parsed); jsonErr != nil {
			return jsonErr
		}
		if parsed.Processed {
			if !parsed.Valid {
				return fmt.Errorf("upload failed validation: %s", parsed.Validation)
			}
			return nil
		}
	}
	return fmt.Errorf("upload not processed after %d polls", amoMaxPolls)
}

func (s amoStore) createVersion(uuid string) error {
	payload, err := json.Marshal(map[string]string{"upload": uuid})
	if err != nil {
		return err
	}
	versionURL := s.apiBase + "/api/v5/addons/addon/" + s.creds.AMOAddonID + "/versions/"
	data, err := s.doAuthed(http.MethodPost, versionURL, bytes.NewReader(payload), "application/json")
	if err != nil {
		return err
	}
	log.Printf("firefox version response: %s", data)
	return nil
}
