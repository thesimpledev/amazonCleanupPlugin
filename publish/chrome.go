package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// Chrome Web Store API v2, per
// https://developer.chrome.com/docs/webstore/using-api: exchange the refresh
// token for an access token, upload the zip, then publish (which submits the
// new version for review).
const (
	// #nosec G101 -- public OAuth endpoint URL, not a credential; gosec reacts to "token" in the name
	defaultChromeTokenURL = "https://oauth2.googleapis.com/token"
	defaultChromeAPIBase  = "https://chromewebstore.googleapis.com"
)

type chromeStore struct {
	client   *http.Client
	tokenURL string
	apiBase  string
	creds    credentials
}

func newChromeStore(client *http.Client, creds credentials) chromeStore {
	return chromeStore{
		client:   client,
		tokenURL: defaultChromeTokenURL,
		apiBase:  defaultChromeAPIBase,
		creds:    creds,
	}
}

func (s chromeStore) run(zipPath string) error {
	if s.creds.CWSPublisherID == "" || s.creds.CWSExtensionID == "" ||
		s.creds.CWSClientID == "" || s.creds.CWSClientSecret == "" ||
		s.creds.CWSRefreshToken == "" {
		return errors.New("chrome: missing credentials " +
			"(publisher id, extension id, client id, client secret, refresh token)")
	}
	token, err := s.accessToken()
	if err != nil {
		return fmt.Errorf("chrome token: %w", err)
	}
	if uploadErr := s.upload(token, zipPath); uploadErr != nil {
		return fmt.Errorf("chrome upload: %w", uploadErr)
	}
	if publishErr := s.publishItem(token); publishErr != nil {
		return fmt.Errorf("chrome publish: %w", publishErr)
	}
	log.Println("chrome: uploaded and submitted for review")
	return nil
}

func (s chromeStore) accessToken() (string, error) {
	form := url.Values{
		"client_id":     {s.creds.CWSClientID},
		"client_secret": {s.creds.CWSClientSecret},
		"refresh_token": {s.creds.CWSRefreshToken},
		"grant_type":    {"refresh_token"},
	}
	req, err := http.NewRequest(http.MethodPost, s.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	data, err := doRequest(s.client, req)
	if err != nil {
		return "", err
	}
	var parsed struct {
		AccessToken string `json:"access_token"`
	}
	if jsonErr := json.Unmarshal(data, &parsed); jsonErr != nil {
		return "", jsonErr
	}
	if parsed.AccessToken == "" {
		return "", errors.New("token response missing access_token")
	}
	return parsed.AccessToken, nil
}

func (s chromeStore) upload(token, zipPath string) error {
	file, err := os.Open(zipPath) // #nosec G304 -- the operator names the zip to upload deliberately
	if err != nil {
		return err
	}
	defer func() {
		_ = file.Close() // read-only handle; a close error carries no information
	}()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	uploadURL := s.apiBase + "/upload/v2/publishers/" + s.creds.CWSPublisherID +
		"/items/" + s.creds.CWSExtensionID + ":upload"
	req, err := http.NewRequest(http.MethodPost, uploadURL, file)
	if err != nil {
		return err
	}
	req.ContentLength = info.Size()
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/zip")
	data, err := doRequest(s.client, req)
	if err != nil {
		return err
	}
	log.Printf("chrome upload response: %s", data)
	return nil
}

func (s chromeStore) publishItem(token string) error {
	publishURL := s.apiBase + "/v2/publishers/" + s.creds.CWSPublisherID +
		"/items/" + s.creds.CWSExtensionID + ":publish"
	req, err := http.NewRequest(http.MethodPost, publishURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	data, err := doRequest(s.client, req)
	if err != nil {
		return err
	}
	log.Printf("chrome publish response: %s", data)
	return nil
}
