/*
 * Background script. Chrome loads this file alone as a service worker and
 * pulls shared code in with importScripts; Firefox lists all the files in
 * background.scripts, where importScripts does not exist.
 *
 * Schedule and quick hide transitions change no stored value on their own,
 * so open tabs would never notice them. The alarms here (a five minute
 * tick, a one-shot at the next computed schedule transition, a one-shot at
 * the quick hide expiry) write a timestamp to the pulse key, and that
 * storage change is what nudges tabs into re-evaluating.
 */

if (typeof importScripts === "function") {
  importScripts("rules.js", "settings.js", "schedule.js");
}

const ACP_TICK_ALARM = "acp-tick";
const ACP_TRANSITION_ALARM = "acp-transition";
const ACP_QUICKHIDE_ALARM = "acp-quickhide";

async function acpEnsureDefaults(): Promise<void> {
  const stored = await acpExt().storage.sync.get(ACP_SETTINGS_KEY);
  if (stored[ACP_SETTINGS_KEY] === undefined) {
    await acpSaveSettings(acpDefaultSettings());
  }
}

async function acpPulse(): Promise<void> {
  await acpExt().storage.local.set({ [ACP_PULSE_KEY]: Date.now() });
}

async function acpArmTransitionAlarm(): Promise<void> {
  const schedules = await acpLoadSchedules();
  const next = acpNextTransition(schedules, Date.now());
  acpExt().alarms.clear(ACP_TRANSITION_ALARM);
  if (next !== null) {
    acpExt().alarms.create(ACP_TRANSITION_ALARM, { when: next });
  }
}

async function acpArmQuickHideAlarm(expiry: unknown): Promise<void> {
  acpExt().alarms.clear(ACP_QUICKHIDE_ALARM);
  if (typeof expiry === "number" && expiry > Date.now()) {
    acpExt().alarms.create(ACP_QUICKHIDE_ALARM, { when: expiry });
  }
}

async function acpWorkerInit(): Promise<void> {
  await acpEnsureDefaults();
  try {
    await acpExt().storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
  } catch {
    /* Older browsers without setAccessLevel: until-restart quick hide is
       then invisible to content scripts, everything else still works. */
  }
  acpExt().alarms.create(ACP_TICK_ALARM, { periodInMinutes: 5 });
  await acpArmTransitionAlarm();
  const local = await acpExt().storage.local.get(ACP_QUICKHIDE_KEY);
  await acpArmQuickHideAlarm(local[ACP_QUICKHIDE_KEY]);
}

acpExt().runtime.onInstalled.addListener(() => {
  void acpWorkerInit();
});

acpExt().runtime.onStartup.addListener(() => {
  void acpWorkerInit();
});

acpExt().alarms.onAlarm.addListener((alarm) => {
  void acpPulse();
  if (alarm.name === ACP_TRANSITION_ALARM) {
    void acpArmTransitionAlarm();
  }
});

acpExt().storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && ACP_SCHEDULES_KEY in changes) {
    void acpArmTransitionAlarm();
    return;
  }
  if (area === "local" && ACP_QUICKHIDE_KEY in changes) {
    void acpArmQuickHideAlarm(changes[ACP_QUICKHIDE_KEY].newValue);
  }
});
