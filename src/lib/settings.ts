/*
 * Settings live in storage.sync under one key. The effective hidden-rule
 * list is mirrored into the page's localStorage so boot.ts can apply gate
 * classes synchronously at document_start, before the async storage read
 * returns. The mirror is a cache, never the source of truth.
 */

interface AcpSettings {
  enabled: boolean;
  rules: Record<string, boolean>;
}

const ACP_SETTINGS_KEY = "settings";
const ACP_MIRROR_KEY = "acp-mirror";

function acpExt(): AcpWebExt {
  if (typeof browser !== "undefined" && browser) {
    return browser;
  }
  return chrome;
}

function acpDefaultSettings(): AcpSettings {
  const rules: Record<string, boolean> = {};
  for (const rule of ACP_RULES) {
    rules[rule.id] = rule.defaultOn;
  }
  return { enabled: true, rules };
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
      const value = rules[rule.id];
      if (typeof value === "boolean") {
        settings.rules[rule.id] = value;
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

function acpHiddenRuleIds(settings: AcpSettings): string[] {
  if (!settings.enabled) {
    return [];
  }
  return ACP_RULES.filter((rule) => settings.rules[rule.id] === true).map(
    (rule) => rule.id
  );
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
};
