package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func testCreds() credentials {
	return credentials{
		CWSPublisherID:  "example-publisher",
		CWSExtensionID:  "example-extension",
		CWSClientID:     "example-client",
		CWSClientSecret: "example-client-secret",
		CWSRefreshToken: "example-refresh-token",
		AMOJWTIssuer:    "user:12345:67",
		AMOJWTSecret:    "example-jwt-secret",
		AMOAddonID:      "example-addon@example",
	}
}

func writeTestZip(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "example.zip")
	if err := os.WriteFile(path, []byte("PK synthetic zip bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// callLog records handler hits; handlers run in server goroutines, so
// access is mutex-guarded for the race detector.
type callLog struct {
	mu    sync.Mutex
	calls []string
}

func (l *callLog) add(name string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.calls = append(l.calls, name)
}

func (l *callLog) snapshot() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]string(nil), l.calls...)
}

func newChromeTestServer(t *testing.T, log *callLog) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		log.add("token")
		if r.Method != http.MethodPost {
			t.Errorf("token method = %s, want POST", r.Method)
		}
		if parseErr := r.ParseForm(); parseErr != nil {
			t.Errorf("token form parse: %v", parseErr)
		}
		if got := r.PostFormValue("grant_type"); got != "refresh_token" {
			t.Errorf("grant_type = %q", got)
		}
		_, _ = w.Write([]byte(`{"access_token":"test-token"}`)) // test handler write
	})
	uploadPath := "/upload/v2/publishers/example-publisher/items/example-extension:upload"
	mux.HandleFunc(uploadPath, func(w http.ResponseWriter, r *http.Request) {
		log.add("upload")
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("upload auth = %q", got)
		}
		_, _ = w.Write([]byte(`{}`)) // test handler write
	})
	publishPath := "/v2/publishers/example-publisher/items/example-extension:publish"
	mux.HandleFunc(publishPath, func(w http.ResponseWriter, r *http.Request) {
		log.add("publish")
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("publish auth = %q", got)
		}
		_, _ = w.Write([]byte(`{}`)) // test handler write
	})
	return httptest.NewServer(mux)
}

func TestChromeRun(t *testing.T) {
	log := &callLog{}
	server := newChromeTestServer(t, log)
	defer server.Close()
	store := chromeStore{
		client:   server.Client(),
		tokenURL: server.URL + "/token",
		apiBase:  server.URL,
		creds:    testCreds(),
	}
	if err := store.run(writeTestZip(t)); err != nil {
		t.Fatalf("run: %v", err)
	}
	got := log.snapshot()
	want := []string{"token", "upload", "publish"}
	if len(got) != len(want) {
		t.Fatalf("calls = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("calls = %v, want %v", got, want)
		}
	}
}

func TestChromeRunMissingCredentials(t *testing.T) {
	store := newChromeStore(http.DefaultClient, credentials{})
	if err := store.run(writeTestZip(t)); err == nil {
		t.Fatal("run with empty credentials should fail")
	}
}

const testUploadUUID = "11111111-2222-3333-4444-555555555555"

func handleAMOUpload(t *testing.T, log *callLog, w http.ResponseWriter, r *http.Request) {
	log.add("upload")
	if parseErr := r.ParseMultipartForm(1 << 20); parseErr != nil {
		t.Errorf("multipart parse: %v", parseErr)
	}
	if got := r.PostFormValue("channel"); got != "listed" {
		t.Errorf("channel = %q, want listed", got)
	}
	_, _ = w.Write([]byte(`{"uuid":"` + testUploadUUID + `"}`)) // test handler write
}

func handleAMOPoll(t *testing.T, log *callLog, polls *int, mu *sync.Mutex, w http.ResponseWriter) {
	log.add("poll")
	mu.Lock()
	*polls++
	processed := *polls > 1
	mu.Unlock()
	response := map[string]any{"processed": processed, "valid": true}
	if encodeErr := json.NewEncoder(w).Encode(response); encodeErr != nil {
		t.Errorf("encode: %v", encodeErr)
	}
}

func handleAMOVersion(t *testing.T, log *callLog, w http.ResponseWriter, r *http.Request) {
	log.add("version")
	var body struct {
		Upload string `json:"upload"`
	}
	if decodeErr := json.NewDecoder(r.Body).Decode(&body); decodeErr != nil {
		t.Errorf("decode: %v", decodeErr)
	}
	if body.Upload != testUploadUUID {
		t.Errorf("upload uuid = %q", body.Upload)
	}
	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write([]byte(`{"id":1}`)) // test handler write
}

func newAMOTestServer(t *testing.T, log *callLog, polls *int) *httptest.Server {
	t.Helper()
	var mu sync.Mutex
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/addons/upload/", func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "JWT ") {
			t.Errorf("auth = %q, want JWT scheme", r.Header.Get("Authorization"))
		}
		if r.Method == http.MethodPost {
			handleAMOUpload(t, log, w, r)
			return
		}
		handleAMOPoll(t, log, polls, &mu, w)
	})
	versionPath := "/api/v5/addons/addon/example-addon@example/versions/"
	mux.HandleFunc(versionPath, func(w http.ResponseWriter, r *http.Request) {
		handleAMOVersion(t, log, w, r)
	})
	return httptest.NewServer(mux)
}

func TestAMORun(t *testing.T) {
	log := &callLog{}
	polls := 0
	server := newAMOTestServer(t, log, &polls)
	defer server.Close()
	store := amoStore{
		client:       server.Client(),
		apiBase:      server.URL,
		creds:        testCreds(),
		now:          time.Now,
		pollInterval: time.Millisecond,
	}
	if err := store.run(writeTestZip(t), "listed"); err != nil {
		t.Fatalf("run: %v", err)
	}
	got := log.snapshot()
	if len(got) != 4 || got[0] != "upload" || got[3] != "version" {
		t.Fatalf("calls = %v, want upload, poll, poll, version", got)
	}
}

func TestAMORunRejectsBadChannel(t *testing.T) {
	store := newAMOStore(http.DefaultClient, testCreds())
	if err := store.run(writeTestZip(t), "sideways"); err == nil {
		t.Fatal("bad channel should fail")
	}
}

func TestAMOTokenSignatureAndClaims(t *testing.T) {
	fixed := time.Unix(1_700_000_000, 0)
	store := amoStore{creds: testCreds(), now: func() time.Time { return fixed }}
	token, err := store.token()
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token has %d parts, want 3", len(parts))
	}
	mac := hmac.New(sha256.New, []byte(testCreds().AMOJWTSecret))
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1])) // hash.Hash.Write never returns an error
	wantSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if parts[2] != wantSig {
		t.Fatal("signature mismatch")
	}
	claimBytes, decodeErr := base64.RawURLEncoding.DecodeString(parts[1])
	if decodeErr != nil {
		t.Fatal(decodeErr)
	}
	var claims struct {
		Iss string `json:"iss"`
		Jti string `json:"jti"`
		Iat int64  `json:"iat"`
		Exp int64  `json:"exp"`
	}
	if jsonErr := json.Unmarshal(claimBytes, &claims); jsonErr != nil {
		t.Fatal(jsonErr)
	}
	if claims.Iss != "user:12345:67" {
		t.Errorf("iss = %q", claims.Iss)
	}
	if claims.Jti == "" {
		t.Error("jti is empty")
	}
	if claims.Exp-claims.Iat > 300 {
		t.Errorf("token lifetime %d exceeds AMO's five minute cap", claims.Exp-claims.Iat)
	}
}

func TestLoadCredentialsEnvOverridesFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "credentials.json")
	fileContent := `{"cws_client_id":"file-client","amo_jwt_issuer":"user:11111:22"}`
	if err := os.WriteFile(path, []byte(fileContent), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CWS_CLIENT_ID", "env-client")
	creds, err := loadCredentials(path)
	if err != nil {
		t.Fatal(err)
	}
	if creds.CWSClientID != "env-client" {
		t.Errorf("CWSClientID = %q, want env-client", creds.CWSClientID)
	}
	if creds.AMOJWTIssuer != "user:11111:22" {
		t.Errorf("AMOJWTIssuer = %q, want file value", creds.AMOJWTIssuer)
	}
}

func TestLoadCredentialsMissingFileIsFine(t *testing.T) {
	if _, err := loadCredentials(filepath.Join(t.TempDir(), "absent.json")); err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
}

func TestAMOValidationFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v5/addons/upload/"+testUploadUUID+"/",
		func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"processed":true,"valid":false,"validation":{"errors":1}}`)) // test handler write
		})
	server := httptest.NewServer(mux)
	defer server.Close()
	store := amoStore{
		client:       server.Client(),
		apiBase:      server.URL,
		creds:        testCreds(),
		now:          time.Now,
		pollInterval: time.Millisecond,
	}
	err := store.waitProcessed(testUploadUUID)
	if err == nil || !strings.Contains(err.Error(), "validation") {
		t.Fatalf("want validation error, got %v", err)
	}
}
