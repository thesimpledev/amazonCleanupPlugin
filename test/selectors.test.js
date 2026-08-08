"use strict";

/*
 * Keeps the selector catalogue, the static CSS, and the fixtures in step
 * without a DOM library: every selector of a shipped rule must appear in
 * rules.css gated on that rule's class, and every plain #id selector must
 * exist in a fixture, so a typo in any of the three places fails here.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("../build/rules/rules.js");

const rules = globalThis.ACP_RULES;
const ruleClass = globalThis.acpRuleClass;
const css = fs.readFileSync(
  path.join(__dirname, "../extension/rules/rules.css"),
  "utf8"
);
const fixtures = fs
  .readdirSync(path.join(__dirname, "fixtures"))
  .filter((name) => name.endsWith(".html"))
  .map((name) =>
    fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")
  )
  .join("\n");

test("every shipped selector has a css block gated on its rule class", () => {
  for (const rule of rules.filter((entry) => entry.shipped)) {
    for (const selector of rule.selectors) {
      const gated = "html." + ruleClass(rule.id) + " " + selector;
      assert.ok(
        css.includes(gated),
        "rules.css is missing: " + gated
      );
    }
  }
});

test("every plain id selector appears in a fixture", () => {
  for (const rule of rules.filter((entry) => entry.shipped)) {
    for (const selector of rule.selectors) {
      if (!/^#[A-Za-z0-9_-]+$/.test(selector)) {
        continue;
      }
      assert.ok(
        fixtures.includes('id="' + selector.slice(1) + '"'),
        "no fixture contains: " + selector
      );
    }
  }
});

test("no unshipped rule carries selectors", () => {
  for (const rule of rules.filter((entry) => !entry.shipped)) {
    assert.equal(rule.selectors.length, 0, rule.id);
  }
});
