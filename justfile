# Amazon Cleanup Plugin
#
# build    compile TypeScript and produce dist/chrome.zip and dist/firefox.zip
# test     node tests (against compiled output) plus the Go gate chain
# publish  upload both zips to the stores (credentials file outside the repo)
# clean    remove build/ and dist/

credentials := env_var_or_default("ACP_CREDENTIALS", env_var("HOME") / ".config/amazon-cleanup/credentials.json")

default: build

build: clean
    tsc -p tsconfig.json
    just assemble chrome
    just assemble firefox
    cd dist/chrome && zip -qr ../chrome.zip .
    cd dist/firefox && zip -qr ../firefox.zip .

# Copy compiled JS and static files into dist/<target> with its manifest.
assemble target:
    mkdir -p dist/{{target}}/js
    cp build/rules/rules.js dist/{{target}}/js/
    cp build/lib/settings.js build/lib/schedule.js build/lib/marketplaces.js dist/{{target}}/js/
    cp build/content/boot.js build/content/observe.js build/content/layout.js dist/{{target}}/js/
    cp build/background/worker.js dist/{{target}}/js/
    cp build/popup/popup.js build/options/options.js dist/{{target}}/js/
    cp -r extension/rules extension/popup extension/options dist/{{target}}/
    cp extension/manifest.{{target}}.json dist/{{target}}/manifest.json

test: build
    TZ=America/New_York node --test
    cd publish && test -z "$(gofmt -l .)"
    cd publish && go vet ./...
    cd publish && staticcheck ./...
    cd publish && errcheck ./...
    cd publish && revive -set_exit_status ./...
    cd publish && go test ./... -race -vet=all -shuffle=on -count=1

publish: build
    cd publish && go run . -store chrome -zip ../dist/chrome.zip -credentials "{{credentials}}"
    cd publish && go run . -store firefox -zip ../dist/firefox.zip -credentials "{{credentials}}"

clean:
    rm -rf build dist
