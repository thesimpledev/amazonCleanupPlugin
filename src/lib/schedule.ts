/*
 * Pure schedule evaluation: (schedules, nowMillis) -> bool, no clock reads
 * inside. Weekly and annual windows evaluate in local time, so tests pin TZ.
 * An annual window that crosses a year boundary (Dec 20 to Jan 5) falls out
 * of evaluating the anchor date in three candidate years. A weekly range
 * whose end minute is at or before its start wraps past midnight into the
 * next day. Malformed schedule entries are skipped, never guessed at.
 */

interface AcpRangeSchedule {
  kind: "range";
  label?: string;
  startMillis: number;
  endMillis: number;
}

interface AcpAnnualSchedule {
  kind: "annual";
  label?: string;
  /* 1-12, unlike Date's 0-11. */
  month: number;
  day: number;
  leadDays: number;
  trailDays: number;
}

interface AcpWeeklySchedule {
  kind: "weekly";
  label?: string;
  /* 0 Sunday through 6 Saturday, matching Date.getDay(). */
  day: number;
  /* Minutes since local midnight. End is exclusive; an end at or before
     the start wraps past midnight into the next day. */
  startMinute: number;
  endMinute: number;
}

type AcpSchedule = AcpRangeSchedule | AcpAnnualSchedule | AcpWeeklySchedule;

interface AcpScheduleWindow {
  schedule: AcpSchedule;
  startMillis: number;
  /* Exclusive. */
  endMillis: number;
}

function acpValidSchedule(schedule: AcpSchedule): boolean {
  switch (schedule.kind) {
    case "range":
      return (
        Number.isFinite(schedule.startMillis) &&
        Number.isFinite(schedule.endMillis) &&
        schedule.startMillis < schedule.endMillis
      );
    case "annual":
      return (
        Number.isInteger(schedule.month) &&
        schedule.month >= 1 &&
        schedule.month <= 12 &&
        Number.isInteger(schedule.day) &&
        schedule.day >= 1 &&
        schedule.day <= 31 &&
        Number.isInteger(schedule.leadDays) &&
        schedule.leadDays >= 0 &&
        schedule.leadDays <= 365 &&
        Number.isInteger(schedule.trailDays) &&
        schedule.trailDays >= 0 &&
        schedule.trailDays <= 365
      );
    case "weekly":
      return (
        Number.isInteger(schedule.day) &&
        schedule.day >= 0 &&
        schedule.day <= 6 &&
        Number.isInteger(schedule.startMinute) &&
        schedule.startMinute >= 0 &&
        schedule.startMinute < 1440 &&
        Number.isInteger(schedule.endMinute) &&
        schedule.endMinute >= 0 &&
        schedule.endMinute <= 1440
      );
    default:
      return false;
  }
}

/* The Date constructor does local-calendar arithmetic, so day and minute
   overflow and underflow (day - leadDays, minute 1440) resolve correctly
   across month, year, and DST boundaries. */

function acpAnnualWindow(
  schedule: AcpAnnualSchedule,
  year: number
): AcpScheduleWindow {
  const start = new Date(
    year,
    schedule.month - 1,
    schedule.day - schedule.leadDays
  ).getTime();
  const end = new Date(
    year,
    schedule.month - 1,
    schedule.day + schedule.trailDays + 1
  ).getTime();
  return { schedule, startMillis: start, endMillis: end };
}

function acpWeeklyWindow(
  schedule: AcpWeeklySchedule,
  base: Date,
  offsetDays: number
): AcpScheduleWindow | null {
  const dayStart = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + offsetDays
  );
  if (dayStart.getDay() !== schedule.day) {
    return null;
  }
  const start = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate(),
    0,
    schedule.startMinute
  ).getTime();
  const wrapDays = schedule.endMinute <= schedule.startMinute ? 1 : 0;
  const end = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate() + wrapDays,
    0,
    schedule.endMinute
  ).getTime();
  return { schedule, startMillis: start, endMillis: end };
}

function acpCandidateWindows(
  schedule: AcpSchedule,
  nowMillis: number
): AcpScheduleWindow[] {
  if (!acpValidSchedule(schedule)) {
    return [];
  }
  if (schedule.kind === "range") {
    return [
      {
        schedule,
        startMillis: schedule.startMillis,
        endMillis: schedule.endMillis,
      },
    ];
  }
  const now = new Date(nowMillis);
  const windows: AcpScheduleWindow[] = [];
  if (schedule.kind === "annual") {
    for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 1; year++) {
      windows.push(acpAnnualWindow(schedule, year));
    }
    return windows;
  }
  /* A weekly window is under two days long, so one containing now starts
     today or yesterday; eight days ahead guarantees a future boundary for
     the next-transition scan. */
  for (let offset = -1; offset <= 8; offset++) {
    const window = acpWeeklyWindow(schedule, now, offset);
    if (window !== null) {
      windows.push(window);
    }
  }
  return windows;
}

/* The active window whose end is furthest out, or null when nothing is
   active. The end drives the popup's "hidden until" line, so overlapping
   windows report the later end. */
function acpActiveWindow(
  schedules: readonly AcpSchedule[],
  nowMillis: number
): AcpScheduleWindow | null {
  let best: AcpScheduleWindow | null = null;
  for (const schedule of schedules) {
    for (const window of acpCandidateWindows(schedule, nowMillis)) {
      if (nowMillis < window.startMillis || nowMillis >= window.endMillis) {
        continue;
      }
      if (best === null || window.endMillis > best.endMillis) {
        best = window;
      }
    }
  }
  return best;
}

function acpScheduleActive(
  schedules: readonly AcpSchedule[],
  nowMillis: number
): boolean {
  return acpActiveWindow(schedules, nowMillis) !== null;
}

/* Earliest future instant at which the active state may change; feeds the
   one-shot alarm. Null when no boundary lies ahead (no schedules, or only
   ranges wholly in the past). */
function acpNextTransition(
  schedules: readonly AcpSchedule[],
  nowMillis: number
): number | null {
  let next: number | null = null;
  for (const schedule of schedules) {
    for (const window of acpCandidateWindows(schedule, nowMillis)) {
      for (const boundary of [window.startMillis, window.endMillis]) {
        if (boundary > nowMillis && (next === null || boundary < next)) {
          next = boundary;
        }
      }
    }
  }
  return next;
}

/* See the note in rules.ts: settings.js calls these bare, which Node only
   resolves through the global object. */
(globalThis as unknown as Record<string, unknown>)["acpScheduleActive"] =
  acpScheduleActive;
(globalThis as unknown as Record<string, unknown>)["acpValidSchedule"] =
  acpValidSchedule;

/* See the note in settings.ts: published for Node tests. */
(globalThis as unknown as Record<string, unknown>)["acpScheduleLib"] = {
  acpValidSchedule,
  acpScheduleActive,
  acpActiveWindow,
  acpNextTransition,
};
