/*
 * Settings live in storage.sync under one key. The effective hidden-rule
 * list is mirrored into the page's localStorage so boot.ts can apply gate
 * classes synchronously at document_start, before the async storage read
 * returns. The mirror is a cache, never the source of truth.
 */

/* Scheduling-capable rules have four states: off, on, scheduled, and quick
   hide. The first three are per-rule settings; quick hide is a separate,
   overriding state that hits every scheduling-capable rule at once. Rules
   without scheduling only use off and on. */
type AcpRuleState = "off" | "on" | "scheduled";

interface AcpSettings {
  enabled: boolean;
  rules: Record<string, AcpRuleState>;
}

type AcpQuickHideChoice = "1h" | "4h" | "midnight" | "restart";

const ACP_SETTINGS_KEY = "settings";
const ACP_SCHEDULES_KEY = "schedules";
const ACP_QUICKHIDE_KEY = "quickHide";
/* Written by the background worker's alarms; a change to it nudges open
   tabs into re-evaluating without any settings change. */
const ACP_PULSE_KEY = "pulse";
const ACP_MIRROR_KEY = "acp-mirror";

function acpExt(): AcpWebExt {
  if (typeof browser !== "undefined" && browser) {
    return browser;
  }
  return chrome;
}

function acpDefaultSettings(): AcpSettings {
  const rules: Record<string, AcpRuleState> = {};
  for (const rule of ACP_RULES) {
    rules[rule.id] = rule.defaultOn ? "on" : "off";
  }
  return { enabled: true, rules };
}

/* Booleans are the pre-scheduling settings shape; accept them forever so a
   sync from an old install never resets anyone's choices. "scheduled" is
   only meaningful on a scheduling-capable rule. */
function acpNormalizeRuleState(
  rule: AcpRule,
  value: unknown
): AcpRuleState | null {
  if (value === true || value === "on") {
    return "on";
  }
  if (value === false || value === "off") {
    return "off";
  }
  if (value === "scheduled" && rule.scheduling) {
    return "scheduled";
  }
  return null;
}

function acpNormalizeSettings(raw: unknown): AcpSettings {
  const settings = acpDefaultSettings();
  if (typeof raw !== "object" || raw === null) {
    return settings;
  }
  const record = raw as { enabled?: unknown; rules?: unknown };
  if (typeof record.enabled === "boolean") {
    settings.enabled = record.enabled;
  }
  if (typeof record.rules === "object" && record.rules !== null) {
    const rules = record.rules as Record<string, unknown>;
    for (const rule of ACP_RULES) {
      const state = acpNormalizeRuleState(rule, rules[rule.id]);
      if (state !== null) {
        settings.rules[rule.id] = state;
      }
    }
  }
  return settings;
}

async function acpLoadSettings(): Promise<AcpSettings> {
  const stored = await acpExt().storage.sync.get(ACP_SETTINGS_KEY);
  return acpNormalizeSettings(stored[ACP_SETTINGS_KEY]);
}

async function acpSaveSettings(settings: AcpSettings): Promise<void> {
  await acpExt().storage.sync.set({ [ACP_SETTINGS_KEY]: settings });
}

function acpHiddenRuleIds(
  settings: AcpSettings,
  schedules: readonly AcpSchedule[],
  quickHideActive: boolean,
  nowMillis: number
): string[] {
  if (!settings.enabled) {
    return [];
  }
  const scheduleOn = acpScheduleActive(schedules, nowMillis);
  const hidden: string[] = [];
  for (const rule of ACP_RULES) {
    if (rule.scheduling && quickHideActive) {
      hidden.push(rule.id);
      continue;
    }
    const state = settings.rules[rule.id];
    if (state === "on" || (state === "scheduled" && scheduleOn)) {
      hidden.push(rule.id);
    }
  }
  return hidden;
}

/* Schedules: one list under one sync key (8KB per-item quota), applying to
   every scheduling-capable rule set to "scheduled". Unknown or malformed
   entries are dropped on read. */

function acpNormalizeSchedules(raw: unknown): AcpSchedule[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const valid: AcpSchedule[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const candidate = entry as AcpSchedule;
    if (acpValidSchedule(candidate)) {
      valid.push(candidate);
    }
  }
  return valid;
}

async function acpLoadSchedules(): Promise<AcpSchedule[]> {
  const stored = await acpExt().storage.sync.get(ACP_SCHEDULES_KEY);
  return acpNormalizeSchedules(stored[ACP_SCHEDULES_KEY]);
}

async function acpSaveSchedules(
  schedules: readonly AcpSchedule[]
): Promise<void> {
  await acpExt().storage.sync.set({ [ACP_SCHEDULES_KEY]: schedules });
}

/* Quick hide. A timed hide is a bare expiry timestamp in storage.local;
   until-restart is a true flag in storage.session, which the browser wipes
   on restart, implementing the feature with no restart detection. */

function acpQuickHideExpiry(
  choice: AcpQuickHideChoice,
  nowMillis: number
): number | null {
  if (choice === "1h") {
    return nowMillis + 3_600_000;
  }
  if (choice === "4h") {
    return nowMillis + 4 * 3_600_000;
  }
  if (choice === "midnight") {
    const now = new Date(nowMillis);
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    ).getTime();
  }
  return null;
}

function acpQuickHideActive(
  localValue: unknown,
  sessionValue: unknown,
  nowMillis: number
): boolean {
  if (sessionValue === true) {
    return true;
  }
  return typeof localValue === "number" && localValue > nowMillis;
}

async function acpReadQuickHideActive(nowMillis: number): Promise<boolean> {
  const local = await acpExt().storage.local.get(ACP_QUICKHIDE_KEY);
  let sessionValue: unknown;
  try {
    const session = await acpExt().storage.session.get(ACP_QUICKHIDE_KEY);
    sessionValue = session[ACP_QUICKHIDE_KEY];
  } catch {
    /* A content script on a cold start can lose the race with the
       background granting session access; treat that as no until-restart
       hide and let the next reconcile pick it up. */
    sessionValue = undefined;
  }
  return acpQuickHideActive(local[ACP_QUICKHIDE_KEY], sessionValue, nowMillis);
}

async function acpStartQuickHide(
  choice: AcpQuickHideChoice,
  nowMillis: number
): Promise<void> {
  const expiry = acpQuickHideExpiry(choice, nowMillis);
  if (expiry === null) {
    await acpExt().storage.session.set({ [ACP_QUICKHIDE_KEY]: true });
    return;
  }
  await acpExt().storage.local.set({ [ACP_QUICKHIDE_KEY]: expiry });
}

/* Mirror helpers. Only callable where localStorage exists (content scripts);
 * localStorage can throw in sandboxed frames, so failures fall back to
 * defaults. */

function acpReadMirror(): string[] | null {
  try {
    const raw = localStorage.getItem(ACP_MIRROR_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function acpWriteMirror(hidden: readonly string[]): void {
  try {
    localStorage.setItem(ACP_MIRROR_KEY, JSON.stringify(hidden));
  } catch {
    /* Sandboxed frame or storage disabled; the mirror is only a cache. */
  }
}

/*
 * Classic scripts have no module system, so Node tests reach the pure
 * functions through globalThis after requiring the compiled file. Harmless
 * in the browser.
 */
(globalThis as unknown as Record<string, unknown>)["acpSettingsLib"] = {
  acpDefaultSettings,
  acpNormalizeSettings,
  acpHiddenRuleIds,
  acpNormalizeSchedules,
  acpQuickHideExpiry,
  acpQuickHideActive,
};
