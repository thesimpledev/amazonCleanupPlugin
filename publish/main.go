// Command publish uploads a built extension zip to the Chrome Web Store or
// to Firefox AMO over their HTTP APIs. Standard library only.
//
// Credentials come from a JSON file (-credentials), with environment
// variables taking precedence over the file, so the same tool works locally
// and in CI. A missing credentials file is not an error as long as the
// environment provides what the chosen store needs.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

type credentials struct {
	CWSPublisherID  string `json:"cws_publisher_id"`
	CWSExtensionID  string `json:"cws_extension_id"`
	CWSClientID     string `json:"cws_client_id"`
	CWSClientSecret string `json:"cws_client_secret"`
	CWSRefreshToken string `json:"cws_refresh_token"`
	AMOJWTIssuer    string `json:"amo_jwt_issuer"`
	AMOJWTSecret    string `json:"amo_jwt_secret"`
	AMOAddonID      string `json:"amo_addon_id"`
}

func main() {
	log.SetFlags(0)
	store := flag.String("store", "", "target store: chrome or firefox")
	zipPath := flag.String("zip", "", "path to the built extension zip")
	credPath := flag.String("credentials", "", "credentials JSON file; environment variables override it")
	channel := flag.String("channel", "listed", "AMO channel: listed or unlisted")
	flag.Parse()
	if err := run(*store, *zipPath, *credPath, *channel); err != nil {
		log.Println("publish:", err)
		os.Exit(1)
	}
}

func run(store, zipPath, credPath, channel string) error {
	if zipPath == "" {
		return errors.New("-zip is required")
	}
	if _, statErr := os.Stat(zipPath); statErr != nil {
		return fmt.Errorf("zip: %w", statErr)
	}
	creds, err := loadCredentials(credPath)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 5 * time.Minute}
	switch store {
	case "chrome":
		return newChromeStore(client, creds).run(zipPath)
	case "firefox":
		return newAMOStore(client, creds).run(zipPath, channel)
	default:
		return fmt.Errorf("unknown -store %q, want chrome or firefox", store)
	}
}

func loadCredentials(path string) (credentials, error) {
	var creds credentials
	if path != "" {
		data, readErr := os.ReadFile(path) // #nosec G304 -- the operator names the credentials file deliberately
		switch {
		case readErr == nil:
			if jsonErr := json.Unmarshal(data, &creds); jsonErr != nil {
				return credentials{}, fmt.Errorf("credentials file: %w", jsonErr)
			}
		case errors.Is(readErr, os.ErrNotExist):
			// Fine: CI provides everything through the environment.
		default:
			return credentials{}, fmt.Errorf("credentials file: %w", readErr)
		}
	}
	applyEnv(&creds)
	return creds, nil
}

func applyEnv(creds *credentials) {
	if creds == nil {
		return
	}
	fields := map[string]*string{
		"CWS_PUBLISHER_ID":  &creds.CWSPublisherID,
		"CWS_EXTENSION_ID":  &creds.CWSExtensionID,
		"CWS_CLIENT_ID":     &creds.CWSClientID,
		"CWS_CLIENT_SECRET": &creds.CWSClientSecret,
		"CWS_REFRESH_TOKEN": &creds.CWSRefreshToken,
		"AMO_JWT_ISSUER":    &creds.AMOJWTIssuer,
		"AMO_JWT_SECRET":    &creds.AMOJWTSecret,
		"AMO_ADDON_ID":      &creds.AMOAddonID,
	}
	for name, target := range fields {
		if value := os.Getenv(name); value != "" {
			*target = value
		}
	}
}

// doRequest performs the request and returns the body for 2xx responses.
// Bodies are capped at 1MB; these APIs return small JSON documents.
func doRequest(client *http.Client, req *http.Request) ([]byte, error) {
	if client == nil || req == nil {
		return nil, errors.New("doRequest: nil client or request")
	}
	// #nosec G704 -- requests to operator-configured store endpoints are this tool's purpose
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = resp.Body.Close() // body already fully read below
	}()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s %s: status %d: %s",
			req.Method, req.URL.Path, resp.StatusCode, data)
	}
	return data, nil
}
