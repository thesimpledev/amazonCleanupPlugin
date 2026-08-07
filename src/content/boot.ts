/*
 * Runs at document_start. Gate classes are applied synchronously from the
 * localStorage mirror so nothing flashes on or off while the async storage
 * read is in flight; the mirror is then reconciled against real settings.
 * First visit with no mirror falls back to catalogue defaults.
 */

function acpApplyHiddenClasses(hidden: readonly string[]): void {
  const root = document.documentElement;
  const wanted = new Set(hidden);
  for (const rule of ACP_RULES) {
    root.classList.toggle(acpRuleClass(rule.id), wanted.has(rule.id));
  }
}

async function acpReconcile(): Promise<void> {
  const nowMillis = Date.now();
  const settings = await acpLoadSettings();
  const schedules = await acpLoadSchedules();
  const quickHide = await acpReadQuickHideActive(nowMillis);
  const hidden = acpHiddenRuleIds(settings, schedules, quickHide, nowMillis);
  acpApplyHiddenClasses(hidden);
  acpWriteMirror(hidden);
  acpLayoutRepair();
}

(function acpBoot(): void {
  const mirrored = acpReadMirror();
  acpApplyHiddenClasses(
    mirrored ?? acpHiddenRuleIds(acpDefaultSettings(), [], false, Date.now())
  );
  void acpReconcile();
  acpExt().storage.onChanged.addListener((changes, area) => {
    if (
      area === "sync" &&
      (ACP_SETTINGS_KEY in changes || ACP_SCHEDULES_KEY in changes)
    ) {
      void acpReconcile();
      return;
    }
    if (
      (area === "local" || area === "session") &&
      (ACP_QUICKHIDE_KEY in changes || ACP_PULSE_KEY in changes)
    ) {
      void acpReconcile();
    }
  });
  acpObserveStart();
})();
