<p align="center">
  <img src="extension/icons/icon-128.png" alt="Cleanup for Amazon icon" width="96" height="96">
</p>

<h1 align="center">Cleanup for Amazon</h1>

<p align="center">
  A browser extension for Chrome and Firefox that hides the parts of
  Amazon you don't want to see. Every cleanup is a toggle.
</p>

## Why this exists

I hate the Alexa shopping assistant experience on Amazon. I wanted one
tool that hides it, and that can also hide the shopping cart and
everything else that spoils surprises at certain times of the year, like
the weeks before a birthday or Christmas, without me having to remember
to turn anything on or off.

## What it hides

| Area | What goes away |
|---|---|
| Shopping assistant | The Amazon Alexa (Formerly Rufus) shopping assistant: the chat panel, its nav button, and the product page assistant summary |
| Cart sidebar | The cart flyout docked to the right edge of every page |
| Cart count | The item count badge on the cart icon |
| Recently viewed | Your browsing history strip and its nav entry |
| Buy again | The buy-it-again suggestion widgets |
| Recommendations | The personalized suggestion cards on the homepage |

Each area is independent: Hidden, Visible, or on a Schedule.

## Schedules and Quick Hide

Set one or more windows on the options page: a date range, a yearly
window (say, December 10 through 26, every year), or a weekly one. While
any window is active, every area set to Schedule hides itself, then
comes back on its own when the window ends.

In a hurry? The Quick Hide button hides everything schedulable for an
hour, four hours, until midnight, or until you restart the browser.

## Privacy

No accounts, no tracking, no analytics, no data collection of any kind.
The extension makes zero network requests. Settings live in your
browser's extension storage and nowhere else.

## Install

Store listings for Chrome and Firefox are in progress. Until they are
live, build from source:

```sh
just build
```

Requirements: the TypeScript compiler (`tsc`), [just](https://github.com/casey/just),
and `zip`. No npm install, no bundler.

Then load it:

- **Chrome**: `chrome://extensions`, enable Developer mode, "Load
  unpacked", pick `dist/chrome/`
- **Firefox**: `about:debugging#/runtime/this-firefox`, "Load Temporary
  Add-on", pick `dist/firefox/manifest.json`

Works on all 22 Amazon marketplaces, from amazon.com to amazon.co.jp.

## Development

`plan.md` is the source of truth for the design. The short version:
selectors live in a rule catalogue (`src/rules/rules.ts`) mirrored by
static CSS (`extension/rules/rules.css`), gated on a class per rule that
a content script sets on `<html>` at document_start, so there is no
flash and no DOM mutation fights.

```sh
just test
```

runs the TypeScript build and the Node test suite (no test framework,
`node --test`). Tests cover the schedule math, including windows that
cross the year boundary and wrap past midnight, and keep the rule
catalogue, the CSS, and the test fixtures in step.

## Release

`just build` leaves three files in `dist/`, and a store release needs
all of them:

- `chrome.zip`: upload to the Chrome Web Store
- `firefox.zip`: upload to Firefox Add-ons
- `source.zip`: upload to Firefox Add-ons alongside `firefox.zip`.
  AMO requires the source that reproduces the compiled JS; this is the
  tracked repo at `HEAD`, so commit before building.

Bump `version` in both `extension/manifest.*.json` first; the stores
reject an upload that reuses a published version number.

## License

MIT
