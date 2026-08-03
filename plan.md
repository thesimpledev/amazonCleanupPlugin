# Amazon Cleanup Plugin

A single Manifest V3 extension for Chrome and Firefox. Toolbar popup with a
slider per cleanup. Replaces Adios Alexa and Hide Amazon Cart Sidebar.

Written in TypeScript, compiled with `tsc` alone. No npm, no package.json, no
node_modules, no bundler. Browser API types come from a hand-written ambient
declaration file (`src/types/webext.d.ts`) covering only the APIs the
extension uses. Builds are driven by a `justfile`.

## Architecture

Everything is driven by a rule catalogue. One object in `rules.ts` plus one
CSS block is a working, toggleable cleanup.

```ts
{
  id: "cart-sidebar",
  group: "cart",
  label: "Cart sidebar",
  defaultOn: true,
  scheduling: true,
  selectors: ["#nav-cart-flyout", ...],
  layoutFix: "resetBodyPadding",
}
```

`rules.css` ships static and hides each rule's selectors gated on a class per
rule on `<html>` (for example `html.acp-cart-sidebar`). Every hide rule uses
`display: none !important`, because Amazon sets inline styles in places and a
specificity fight is otherwise guaranteed.

Extension settings storage is asynchronous, and the page paints before the
read returns. To avoid any flash in either direction, `boot.ts` runs at
`document_start` and applies the gate classes synchronously from a mirror of
the effective rule state kept in the page's own `localStorage` (content
scripts share it with the origin, and it reads synchronously). It then reads
the real settings asynchronously, reconciles the classes, and refreshes the
mirror. On a first visit with no mirror, catalogue defaults apply. In
practice the mirror is always right, so nothing flashes on or off.

Rules hide with CSS. Nothing gets removed from the DOM, because deleting
nodes makes Amazon's own scripts throw and breaks search and add to cart.

Amazon sets inline `padding-right` on `body` to reserve room for the cart
sidebar and the Alexa panel. `layout.ts` resets it. Amazon's scripts re-apply
the padding after the reset, so the fix is idempotent and re-runs from the
observer rather than running once.

`observe.ts` runs one debounced `MutationObserver` for content Amazon injects
after first paint. One observer total, not one per rule. `document.body` does
not exist at `document_start`, so the observer attaches once body exists. It
watches child mutations and also the `style` attribute on `body`, which is
what triggers the padding re-fix.

## Layout

```
LICENSE                       MIT
justfile                      build | test | publish | clean
tsconfig.json                 strict, ES2022, module "none", outDir build/
go.mod                        module for cmd/publish
cmd/publish/main.go           store upload tool, standard library only
extension/
  manifest.chrome.json
  manifest.firefox.json
  rules/rules.css
  popup/popup.html popup.css
  options/options.html options.css
src/
  types/webext.d.ts
  rules/rules.ts
  lib/settings.ts
  lib/schedule.ts
  lib/marketplaces.ts
  content/boot.ts
  content/observe.ts
  content/layout.ts
  background/worker.ts
  popup/popup.ts
  options/options.ts
test/
  schedule.test.ts
  fixtures/
.github/workflows/
  ci.yml
  release.yml
```

There is no manifest merging. `manifest.chrome.json` and
`manifest.firefox.json` are two complete files. Chrome's manifest declares
`background.service_worker`; Firefox's declares `background.scripts` plus
`browser_specific_settings.gecko.id` and `strict_min_version: "128.0"`.
Chrome versions before 121 refuse to load a manifest containing
`background.scripts`, which is why the keys never share a file.

`just build` runs `tsc`, assembles `dist/chrome/` and `dist/firefox/` (static
files, compiled JS, the right manifest renamed to `manifest.json`), and zips
both. Scripts are compiled as classic scripts (`module: "none"`) and loaded
in dependency order: content scripts as an ordered file list in the manifest,
popup and options as ordered `<script>` tags, background as an ordered
`scripts` array on Firefox and `importScripts` inside the Chrome service
worker.

Permissions are `storage` and `alarms`. Chrome match patterns cannot wildcard
a TLD, so `*://*.amazon.*/*` is invalid and every marketplace is listed
explicitly in `marketplaces.ts`. amazon.com ships in `host_permissions`; the
rest sit in `optional_host_permissions` and the options page requests them.

Settings live in `storage.sync`, with all schedules under a single key
(mindful of the 8KB per-item quota) and options page saves debounced (sync
rate-limits writes). The price queue lives in `storage.local`. Quick hide
expiries live in `storage.local`, except "until restart" which lives in
`storage.session` because that area is wiped on browser restart, which
implements the feature with no restart detection. `storage.onChanged` pushes
changes into open tabs, so a slider takes effect without a reload.

## Rules

**Shopping assistant**
`alexa-shopping` chat panel, nav entry, prompt chips, AI review summary

**Cart**
`cart-sidebar` flyout, `cart-count` badge, `recently-viewed`, `buy-again`,
`recommendations`

**Sponsored**
`sponsored-results` in search, `sponsored-carousels` on product pages,
`sponsored-brands` banners, `sponsored-video`

**Navigation**
`site-stripe`, `nav-flyouts`, `left-nav-ads`

**Pressure**
`urgency` (only N left, countdown timers), `prime-upsell`, `subscribe-save`,
`audible-music`, `insurance-warranty`

On by default: `alexa-shopping`, `cart-sidebar`. A fresh install behaves
exactly like the two extensions it replaces.

Sponsored tiles carry no stable class. The marker is a "Sponsored" label
inside the tile and CSS cannot match on descendant text, so these rules run a
JS pass that finds the label and hides the enclosing container, re-run on
mutation. Sponsored tiles collapse fully; the options page has a
dim-and-label mode instead, since collapsing leaves gaps in the result grid.

Gift mode is a single switch that flips the whole cart group at once. A gift
leaks through browsing history and recommendation carousels as easily as
through the cart, so schedules target this rather than the sidebar alone.

## Scheduling

Rules marked `scheduling: true` (the cart group) have four states: off, on,
scheduled, and quick hide. Quick hide overrides the rest.

Schedules come in three shapes:

- **Range**, explicit start and end dates
- **Annual**, month and day repeating yearly with lead-in and trail-off days.
  Christmas is Dec 25 with 30 days lead. A birthday is the date with 14.
- **Weekly**, day plus time range

Quick hide is one popup button with a duration: 1 hour, 4 hours, until
midnight, until restart. Timed durations write an expiry timestamp to
`storage.local`; until restart writes to `storage.session`. Quick hide wins
over everything else.

`lib/schedule.ts` is pure: `(schedules, nowMillis) -> bool`, no clock reads
inside. Weekly and annual windows evaluate in local time, so the tests pin
`TZ` and cover at least one non-UTC zone. Annual windows that cross a year
boundary (Dec 20 to Jan 5) are the case that gets written wrong, so they get
explicit tests. Evaluation runs on page load, on settings change, on a five
minute alarm, and on a one-shot alarm set for the next computed transition.

## Popup

Sliders grouped by category, collapsible. Master kill switch at the top that
disables everything without discarding settings. Quick hide button with its
duration picker. A status line reading "Cart sidebar hidden until Dec 25
(Christmas)". Schedule editing lives in the options page, which also does
JSON import and export.

## Git and deployment

Two branches: `beta` is where work happens, `master` is what deploys. Merges
only, never rebase. The repository is public on GitHub under an MIT license.

One Go tool, `cmd/publish`, standard library only, uploads a built zip to
both stores over their HTTP APIs: the Chrome Web Store API (OAuth refresh
token flow, then upload and publish) and the Firefox AMO API (JWT-signed
upload). It runs two ways:

- GitHub Actions: `release.yml` fires on push to `master`, builds, tests,
  and publishes to both stores using repo secrets. It publishes only when
  the manifest version changed, so a docs-only merge does not attempt a
  release. `ci.yml` runs build and tests on `beta` pushes and pull requests.
- Locally: `just publish` runs the same tool with credentials from a file
  outside the repo.

The first listing on each store is created manually through the dashboards
(name, description, screenshots, privacy answers). Automation handles every
version after that. Uploaded versions still go through each store's normal
review before going live.

**One-time setup checklist (user):**

1. Create the public GitHub repo and add it as the remote.
2. Register a Chrome Web Store developer account ($5 one-time), then create
   an OAuth client and refresh token for the Chrome Web Store API.
3. Create a Firefox Add-ons (AMO) account and generate API credentials (JWT
   issuer and secret).
4. Add the credentials as GitHub repo secrets: `CWS_PUBLISHER_ID`,
   `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
   `CWS_REFRESH_TOKEN`, `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`. (The AMO
   add-on id is not a secret; the release workflow reads it out of the
   Firefox manifest.)

## Price history (wish list)

Opt-in, off by default, may never be built. It needs a privacy policy and a
data disclosure on both stores, so it ships as its own version with a fresh
review.

`price.ts` reads ASIN, title, price, currency, marketplace, seller, and
availability from product pages as you open them, at most one observation per
ASIN per six hours. The background worker batches the queue and flushes on an
alarm, so a browsing session is a few requests rather than one per page.
Nothing fetches Amazon server side.

Go Lambda behind a Function URL, two routes: `POST /observations` and
`GET /history?asin=`. Turso via `github.com/tursodatabase/libsql-client-go`,
the pure Go client that talks to Turso Cloud over the network. No CGO
anywhere; the local/embedded Turso packages are not used. us-east-2. Binary
to `s3://deploy-bucket-b3ae1b2cde6b/amazonCleanupPlugin/bin/`, config
alongside it, tagged `kind=bin`/`kind=config` and
`project=amazonCleanupPlugin`. Turso token in Secrets Manager.

```sql
items(asin TEXT PRIMARY KEY, title TEXT, marketplace TEXT, first_seen INTEGER)
observations(id INTEGER PRIMARY KEY, asin TEXT, observed_at INTEGER,
             price_cents INTEGER, currency TEXT, seller TEXT,
             availability TEXT)
alerts(id INTEGER PRIMARY KEY, install_id TEXT, asin TEXT,
       threshold_cents INTEGER, created_at INTEGER)
```

Index on `(asin, observed_at)`. Ingest drops an observation when the newest
for that ASIN matches on price and is under six hours old, keeping the table
proportional to price changes rather than to browsing.

Extension source is public, so the per-install token minted on first run is
abuse control, not authentication: anyone can mint one. The mint endpoint is
rate limited per IP and capped per day, each token is rate limited with a
capped batch size, and the Function URL sets CORS for the extension's
`chrome-extension://` and `moz-extension://` origins.

Product pages get an inline panel under the price: current, low, high, and a
sparkline built as inline SVG. No charting library.

## Testing

Fixtures in `test/fixtures/` are hand written minimal HTML reproducing the
structure a rule targets, with placeholder ASINs like `B0EXAMPLE01`. No saved
Amazon pages.

`schedule.ts` and `settings.ts` are pure and get `node:test` coverage with no
framework dependency, run with `TZ` pinned. Selectors run against the
fixtures.

`cmd/publish` gets `go test` against `httptest` servers with synthetic
responses. Gates: `go fmt`, `go vet`, `staticcheck`, `errcheck`, `revive`,
`go test ./... -race -vet=all -shuffle=on -count=1`, `goaudit`. Dependencies
vendored if any appear (none expected).

## Order of work

**0. Skeleton and automation.** Git repo with `master` and `beta`, MIT
license, both manifests, the justfile build producing both zips, tsconfig and
the ambient types, the settings library and defaults, the rule catalogue
loader and CSS gating, `boot.ts`, `observe.ts`, `layout.ts`, the popup and
options shells, `cmd/publish`, and both GitHub Actions workflows. Rules are
stubbed, so it loads clean in Chrome and Firefox and changes nothing on the
page yet. The user works through the store account checklist in parallel.

**1. Parity, then ship.** `alexa-shopping` and `cart-sidebar` with layout
repair, plus the scheduling that makes the cart worth having: `schedule.ts`,
the options page schedule editor, alarms, and quick hide. Then the first
listed submission to the Chrome Web Store and Firefox AMO, so the extension
is installable from the stores. The two current extensions come off once it
is live.

**2. Everything else.** The remaining rules: sponsored detection, site
stripe, navigation, pressure and upsell, the gift-leakage carousels, and gift
mode. Shipped as store updates through the automation.

**3. Price history (wish list).** Separate version and a fresh review on both
stores, since it adds a privacy policy and a data disclosure the earlier
releases do not need. Optional extras if it ever lands: price drop
notifications, fuller history view, export.

Selectors get read off live pages in the phase that needs them, phase 1 for
the assistant and cart and phase 2 for the rest, rather than written from
memory. Amazon's class names differ per marketplace and change over time.
