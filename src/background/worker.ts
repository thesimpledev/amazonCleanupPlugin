/*
 * Background script. Chrome loads this file alone as a service worker and
 * pulls shared code in with importScripts; Firefox lists all the files in
 * background.scripts, where importScripts does not exist. Phase 1 adds the
 * five minute schedule alarm, the next-transition one-shot alarm, and quick
 * hide expiry handling.
 */

if (typeof importScripts === "function") {
  importScripts("rules.js", "settings.js", "schedule.js");
}

async function acpEnsureDefaults(): Promise<void> {
  const stored = await acpExt().storage.sync.get(ACP_SETTINGS_KEY);
  if (stored[ACP_SETTINGS_KEY] === undefined) {
    await acpSaveSettings(acpDefaultSettings());
  }
}

acpExt().runtime.onInstalled.addListener(() => {
  void acpEnsureDefaults();
});
