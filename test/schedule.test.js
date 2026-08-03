"use strict";

/*
 * Tests run against the compiled output in build/, which are classic
 * scripts with no module system; the libs publish their pure functions on
 * globalThis for exactly this purpose. Run with TZ pinned (see justfile):
 * weekly and annual schedules evaluate in local time.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

require("../build/rules/rules.js");
require("../build/lib/schedule.js");
require("../build/lib/settings.js");

const { acpScheduleActive } = globalThis.acpScheduleLib;
const { acpDefaultSettings, acpNormalizeSettings, acpHiddenRuleIds } =
  globalThis.acpSettingsLib;

test("no schedules means inactive", () => {
  assert.equal(acpScheduleActive([], 1_000), false);
});

test("range schedule is active inside the window", () => {
  const schedules = [{ kind: "range", startMillis: 100, endMillis: 200 }];
  assert.equal(acpScheduleActive(schedules, 150), true);
});

test("range schedule is inactive outside the window", () => {
  const schedules = [{ kind: "range", startMillis: 100, endMillis: 200 }];
  assert.equal(acpScheduleActive(schedules, 99), false);
  assert.equal(acpScheduleActive(schedules, 200), false);
});

test("defaults enable exactly alexa-shopping and cart-sidebar", () => {
  const hidden = acpHiddenRuleIds(acpDefaultSettings());
  assert.deepEqual(hidden.sort(), ["alexa-shopping", "cart-sidebar"]);
});

test("master switch off hides nothing", () => {
  const settings = acpDefaultSettings();
  settings.enabled = false;
  assert.deepEqual(acpHiddenRuleIds(settings), []);
});

test("normalize tolerates garbage and keeps known overrides", () => {
  assert.deepEqual(acpNormalizeSettings(null), acpDefaultSettings());
  assert.deepEqual(acpNormalizeSettings("junk"), acpDefaultSettings());
  const normalized = acpNormalizeSettings({
    enabled: true,
    rules: { "cart-sidebar": false, "not-a-rule": true, urgency: "yes" },
  });
  assert.equal(normalized.rules["cart-sidebar"], false);
  assert.equal("not-a-rule" in normalized.rules, false);
  assert.equal(normalized.rules["urgency"], false);
});
