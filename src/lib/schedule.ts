/*
 * Pure schedule evaluation: (schedules, nowMillis) -> bool, no clock reads
 * inside. Weekly and annual windows evaluate in local time, so tests pin TZ.
 * Phase 1 implements annual (including year-boundary windows like Dec 20 to
 * Jan 5) and weekly; range exists now to prove the shape end to end.
 */

interface AcpRangeSchedule {
  kind: "range";
  startMillis: number;
  endMillis: number;
}

interface AcpAnnualSchedule {
  kind: "annual";
  month: number;
  day: number;
  leadDays: number;
  trailDays: number;
}

interface AcpWeeklySchedule {
  kind: "weekly";
  day: number;
  startMinute: number;
  endMinute: number;
}

type AcpSchedule = AcpRangeSchedule | AcpAnnualSchedule | AcpWeeklySchedule;

function acpScheduleActive(
  schedules: readonly AcpSchedule[],
  nowMillis: number
): boolean {
  for (const schedule of schedules) {
    if (
      schedule.kind === "range" &&
      nowMillis >= schedule.startMillis &&
      nowMillis < schedule.endMillis
    ) {
      return true;
    }
  }
  return false;
}

/* See the note in settings.ts: published for Node tests. */
(globalThis as unknown as Record<string, unknown>)["acpScheduleLib"] = {
  acpScheduleActive,
};
