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

const {
  acpValidSchedule,
  acpScheduleActive,
  acpActiveWindow,
  acpNextTransition,
} = globalThis.acpScheduleLib;

/* Local-time helper matching how the library builds windows. */
function at(year, month1, day, hour = 0, minute = 0) {
  return new Date(year, month1 - 1, day, hour, minute).getTime();
}
const {
  acpDefaultSettings,
  acpNormalizeSettings,
  acpHiddenRuleIds,
  acpNormalizeSchedules,
  acpQuickHideExpiry,
  acpQuickHideActive,
} = globalThis.acpSettingsLib;

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

test("annual window with lead days", () => {
  const christmas = [
    { kind: "annual", month: 12, day: 25, leadDays: 30, trailDays: 0 },
  ];
  assert.equal(acpScheduleActive(christmas, at(2026, 11, 24, 23, 59)), false);
  assert.equal(acpScheduleActive(christmas, at(2026, 11, 25)), true);
  assert.equal(acpScheduleActive(christmas, at(2026, 12, 1)), true);
  assert.equal(acpScheduleActive(christmas, at(2026, 12, 25, 23, 59)), true);
  assert.equal(acpScheduleActive(christmas, at(2026, 12, 26)), false);
});

test("annual window crossing the year boundary", () => {
  /* Anchored Jan 1, lead 12, trail 4: Dec 20 through Jan 5 inclusive. */
  const newYear = [
    { kind: "annual", month: 1, day: 1, leadDays: 12, trailDays: 4 },
  ];
  assert.equal(acpScheduleActive(newYear, at(2026, 12, 19, 23, 59)), false);
  assert.equal(acpScheduleActive(newYear, at(2026, 12, 20)), true);
  assert.equal(acpScheduleActive(newYear, at(2026, 12, 25)), true);
  assert.equal(acpScheduleActive(newYear, at(2027, 1, 3)), true);
  assert.equal(acpScheduleActive(newYear, at(2027, 1, 5, 23, 59)), true);
  assert.equal(acpScheduleActive(newYear, at(2027, 1, 6)), false);
});

test("weekly window on its day and time range", () => {
  /* 2026-08-08 is a Saturday. Day 6, 09:00 to 17:00. */
  const weekly = [
    { kind: "weekly", day: 6, startMinute: 540, endMinute: 1020 },
  ];
  assert.equal(acpScheduleActive(weekly, at(2026, 8, 8, 8, 59)), false);
  assert.equal(acpScheduleActive(weekly, at(2026, 8, 8, 9, 0)), true);
  assert.equal(acpScheduleActive(weekly, at(2026, 8, 8, 16, 59)), true);
  assert.equal(acpScheduleActive(weekly, at(2026, 8, 8, 17, 0)), false);
  assert.equal(acpScheduleActive(weekly, at(2026, 8, 9, 10, 0)), false);
});

test("weekly window wrapping past midnight", () => {
  /* 2026-08-07 is a Friday. Day 5, 22:00 to 02:00 the next morning. */
  const lateNight = [
    { kind: "weekly", day: 5, startMinute: 1320, endMinute: 120 },
  ];
  assert.equal(acpScheduleActive(lateNight, at(2026, 8, 7, 21, 0)), false);
  assert.equal(acpScheduleActive(lateNight, at(2026, 8, 7, 23, 0)), true);
  assert.equal(acpScheduleActive(lateNight, at(2026, 8, 8, 1, 0)), true);
  assert.equal(acpScheduleActive(lateNight, at(2026, 8, 8, 2, 0)), false);
});

test("malformed schedules are skipped", () => {
  const broken = [
    { kind: "annual", month: 13, day: 1, leadDays: 0, trailDays: 0 },
    { kind: "weekly", day: 7, startMinute: 0, endMinute: 60 },
    { kind: "range", startMillis: 200, endMillis: 100 },
  ];
  for (const schedule of broken) {
    assert.equal(acpValidSchedule(schedule), false);
  }
  assert.equal(acpScheduleActive(broken, at(2026, 8, 7, 12, 0)), false);
});

test("active window reports the schedule and the later end", () => {
  const schedules = [
    { kind: "range", label: "short", startMillis: 100, endMillis: 200 },
    { kind: "range", label: "long", startMillis: 100, endMillis: 300 },
  ];
  const window = acpActiveWindow(schedules, 150);
  assert.equal(window.schedule.label, "long");
  assert.equal(window.endMillis, 300);
  assert.equal(acpActiveWindow(schedules, 300), null);
});

test("next transition finds the nearest boundary ahead", () => {
  const christmas = [
    { kind: "annual", month: 12, day: 25, leadDays: 30, trailDays: 0 },
  ];
  assert.equal(
    acpNextTransition(christmas, at(2026, 11, 1)),
    at(2026, 11, 25)
  );
  assert.equal(
    acpNextTransition(christmas, at(2026, 12, 1)),
    at(2026, 12, 26)
  );
  const pastOnly = [{ kind: "range", startMillis: 100, endMillis: 200 }];
  assert.equal(acpNextTransition(pastOnly, 500), null);
  assert.equal(acpNextTransition([], 500), null);
});

test("defaults enable exactly alexa-shopping and cart-sidebar", () => {
  const hidden = acpHiddenRuleIds(acpDefaultSettings(), [], false, 0);
  assert.deepEqual(hidden.sort(), ["alexa-shopping", "cart-sidebar"]);
});

test("master switch off hides nothing", () => {
  const settings = acpDefaultSettings();
  settings.enabled = false;
  assert.deepEqual(acpHiddenRuleIds(settings, [], true, 0), []);
});

test("normalize tolerates garbage and keeps known overrides", () => {
  assert.deepEqual(acpNormalizeSettings(null), acpDefaultSettings());
  assert.deepEqual(acpNormalizeSettings("junk"), acpDefaultSettings());
  const normalized = acpNormalizeSettings({
    enabled: true,
    rules: { "cart-sidebar": false, "not-a-rule": true, urgency: "yes" },
  });
  assert.equal(normalized.rules["cart-sidebar"], "off");
  assert.equal("not-a-rule" in normalized.rules, false);
  assert.equal(normalized.rules["urgency"], "off");
});

test("normalize maps legacy booleans and gates scheduled", () => {
  const normalized = acpNormalizeSettings({
    enabled: true,
    rules: {
      "alexa-shopping": true,
      "cart-sidebar": "scheduled",
      urgency: "scheduled",
    },
  });
  assert.equal(normalized.rules["alexa-shopping"], "on");
  assert.equal(normalized.rules["cart-sidebar"], "scheduled");
  /* urgency has scheduling: false, so "scheduled" falls back to default. */
  assert.equal(normalized.rules["urgency"], "off");
});

test("scheduled rule hides only inside an active window", () => {
  const settings = acpDefaultSettings();
  settings.rules["cart-sidebar"] = "scheduled";
  const schedules = [{ kind: "range", startMillis: 100, endMillis: 200 }];
  assert.equal(
    acpHiddenRuleIds(settings, schedules, false, 150).includes("cart-sidebar"),
    true
  );
  assert.equal(
    acpHiddenRuleIds(settings, schedules, false, 250).includes("cart-sidebar"),
    false
  );
});

test("quick hide overrides every scheduling-capable rule", () => {
  const settings = acpDefaultSettings();
  settings.rules["cart-sidebar"] = "off";
  settings.rules["alexa-shopping"] = "off";
  const hidden = acpHiddenRuleIds(settings, [], true, 0);
  /* Every cart-group rule is forced hidden, even when set to off... */
  assert.equal(hidden.includes("cart-sidebar"), true);
  assert.equal(hidden.includes("recently-viewed"), true);
  /* ...but a non-scheduling rule set to off stays visible. */
  assert.equal(hidden.includes("alexa-shopping"), false);
});

test("quick hide expiry choices", () => {
  const noon = at(2026, 8, 7, 12, 0);
  assert.equal(acpQuickHideExpiry("1h", noon), noon + 3_600_000);
  assert.equal(acpQuickHideExpiry("4h", noon), noon + 4 * 3_600_000);
  assert.equal(acpQuickHideExpiry("midnight", noon), at(2026, 8, 8));
  assert.equal(acpQuickHideExpiry("restart", noon), null);
});

test("quick hide active state", () => {
  assert.equal(acpQuickHideActive(undefined, true, 0), true);
  assert.equal(acpQuickHideActive(500, undefined, 400), true);
  assert.equal(acpQuickHideActive(500, undefined, 500), false);
  assert.equal(acpQuickHideActive(undefined, undefined, 0), false);
  assert.equal(acpQuickHideActive("junk", "junk", 0), false);
});

test("normalize schedules drops malformed entries", () => {
  const normalized = acpNormalizeSchedules([
    { kind: "range", startMillis: 100, endMillis: 200 },
    { kind: "annual", month: 13, day: 1, leadDays: 0, trailDays: 0 },
    "junk",
    null,
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].kind, "range");
  assert.deepEqual(acpNormalizeSchedules("junk"), []);
});
