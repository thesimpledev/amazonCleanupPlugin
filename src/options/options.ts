/*
 * Options page: the shared schedule editor and JSON import and export.
 * Schedule saves are debounced because storage.sync rate-limits writes.
 * Every marketplace is enabled from install, so there is nothing to
 * configure about them here.
 */

const ACP_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ACP_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

let acpSchedules: AcpSchedule[] = [];
let acpScheduleSaveTimer: number | undefined;

function acpSaveSchedulesDebounced(): void {
  if (acpScheduleSaveTimer !== undefined) {
    clearTimeout(acpScheduleSaveTimer);
  }
  acpScheduleSaveTimer = setTimeout(() => {
    void acpSaveSchedules(acpSchedules);
  }, 400);
}

function acpFieldValue(id: string): string {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    return el.value;
  }
  return "";
}

function acpNumberValue(id: string): number | null {
  const raw = acpFieldValue(id);
  if (raw === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function acpDateInputParts(
  id: string
): { year: number; month: number; day: number } | null {
  const parts = acpFieldValue(id).split("-");
  if (parts.length !== 3) {
    return null;
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  return { year, month, day };
}

/* Time inputs give "HH:MM"; minutes since midnight is what weekly
   schedules store. */
function acpTimeInputMinutes(id: string): number | null {
  const parts = acpFieldValue(id).split(":");
  if (parts.length < 2) {
    return null;
  }
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function acpInput(id: string, type: string): HTMLInputElement {
  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  return input;
}

function acpSelectField(
  id: string,
  options: readonly { value: string; text: string }[]
): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = id;
  for (const entry of options) {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.text;
    select.appendChild(option);
  }
  return select;
}

function acpField(labelText: string, control: HTMLElement): HTMLElement {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = labelText;
  label.appendChild(span);
  label.appendChild(control);
  return label;
}

function acpRenderScheduleFields(kind: string): void {
  const host = document.getElementById("schedule-fields");
  if (!host) {
    return;
  }
  host.textContent = "";
  if (kind === "range") {
    host.appendChild(acpField("Start", acpInput("schedule-start", "date")));
    host.appendChild(
      acpField("End (inclusive)", acpInput("schedule-end", "date"))
    );
    return;
  }
  if (kind === "annual") {
    host.appendChild(
      acpField(
        "Month",
        acpSelectField(
          "schedule-month",
          ACP_MONTH_NAMES.map((name, index) => ({
            value: String(index + 1),
            text: name,
          }))
        )
      )
    );
    host.appendChild(acpField("Day", acpInput("schedule-day", "number")));
    host.appendChild(
      acpField("Days before", acpInput("schedule-lead", "number"))
    );
    host.appendChild(
      acpField("Days after", acpInput("schedule-trail", "number"))
    );
    return;
  }
  host.appendChild(
    acpField(
      "Day",
      acpSelectField(
        "schedule-weekday",
        ACP_DAY_NAMES.map((name, index) => ({
          value: String(index),
          text: name,
        }))
      )
    )
  );
  host.appendChild(
    acpField("From", acpInput("schedule-start-time", "time"))
  );
  host.appendChild(acpField("To", acpInput("schedule-end-time", "time")));
}

function acpBuildRange(label: string): AcpRangeSchedule | null {
  const start = acpDateInputParts("schedule-start");
  const end = acpDateInputParts("schedule-end");
  if (start === null || end === null) {
    return null;
  }
  const schedule: AcpRangeSchedule = {
    kind: "range",
    startMillis: new Date(start.year, start.month - 1, start.day).getTime(),
    /* The end date is inclusive; the stored end is the midnight after. */
    endMillis: new Date(end.year, end.month - 1, end.day + 1).getTime(),
  };
  if (label !== "") {
    schedule.label = label;
  }
  return schedule;
}

function acpBuildAnnual(label: string): AcpAnnualSchedule | null {
  const month = acpNumberValue("schedule-month");
  const day = acpNumberValue("schedule-day");
  const leadDays = acpNumberValue("schedule-lead");
  const trailDays = acpNumberValue("schedule-trail");
  if (month === null || day === null || leadDays === null || trailDays === null) {
    return null;
  }
  const schedule: AcpAnnualSchedule = {
    kind: "annual",
    month,
    day,
    leadDays,
    trailDays,
  };
  if (label !== "") {
    schedule.label = label;
  }
  return schedule;
}

function acpBuildWeekly(label: string): AcpWeeklySchedule | null {
  const day = acpNumberValue("schedule-weekday");
  const startMinute = acpTimeInputMinutes("schedule-start-time");
  const endMinute = acpTimeInputMinutes("schedule-end-time");
  if (day === null || startMinute === null || endMinute === null) {
    return null;
  }
  const schedule: AcpWeeklySchedule = {
    kind: "weekly",
    day,
    startMinute,
    endMinute,
  };
  if (label !== "") {
    schedule.label = label;
  }
  return schedule;
}

function acpDescribeMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return (
    String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0")
  );
}

function acpDescribeDate(millis: number): string {
  return new Date(millis).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function acpDescribeSchedule(schedule: AcpSchedule): string {
  const name = schedule.label ? schedule.label + ": " : "";
  if (schedule.kind === "range") {
    return (
      name +
      acpDescribeDate(schedule.startMillis) +
      " to " +
      acpDescribeDate(schedule.endMillis - 1)
    );
  }
  if (schedule.kind === "annual") {
    return (
      name +
      ACP_MONTH_NAMES[schedule.month - 1] +
      " " +
      schedule.day +
      " every year, " +
      schedule.leadDays +
      " days before, " +
      schedule.trailDays +
      " after"
    );
  }
  return (
    name +
    ACP_DAY_NAMES[schedule.day] +
    " " +
    acpDescribeMinute(schedule.startMinute) +
    " to " +
    acpDescribeMinute(schedule.endMinute)
  );
}

function acpRenderScheduleList(): void {
  const list = document.getElementById("schedule-list");
  if (!list) {
    return;
  }
  list.textContent = "";
  acpSchedules.forEach((schedule, index) => {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = acpDescribeSchedule(schedule);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      acpSchedules.splice(index, 1);
      acpSaveSchedulesDebounced();
      acpRenderScheduleList();
    });
    item.appendChild(text);
    item.appendChild(remove);
    list.appendChild(item);
  });
}

function acpAddSchedule(): void {
  const kind = acpFieldValue("schedule-kind");
  const label = acpFieldValue("schedule-label").trim();
  let schedule: AcpSchedule | null;
  if (kind === "range") {
    schedule = acpBuildRange(label);
  } else if (kind === "annual") {
    schedule = acpBuildAnnual(label);
  } else {
    schedule = acpBuildWeekly(label);
  }
  const message = document.getElementById("schedule-message");
  if (schedule === null || !acpValidSchedule(schedule)) {
    if (message) {
      message.textContent = "Fill in every field with valid values first.";
    }
    return;
  }
  if (message) {
    message.textContent = "";
  }
  acpSchedules.push(schedule);
  acpSaveSchedulesDebounced();
  acpRenderScheduleList();
}

async function acpScheduleEditorInit(): Promise<void> {
  acpSchedules = await acpLoadSchedules();
  acpRenderScheduleList();
  await acpRenderScheduleAreas();
  acpExt().storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && ACP_SETTINGS_KEY in changes) {
      void acpRenderScheduleAreas();
    }
  });
  const kind = document.getElementById("schedule-kind");
  if (kind instanceof HTMLSelectElement) {
    acpRenderScheduleFields(kind.value);
    kind.addEventListener("change", () => {
      acpRenderScheduleFields(kind.value);
    });
  }
  const add = document.getElementById("schedule-add-button");
  if (add) {
    add.addEventListener("click", acpAddSchedule);
  }
}

async function acpExportJson(): Promise<void> {
  const text = document.getElementById("io-text");
  if (!(text instanceof HTMLTextAreaElement)) {
    return;
  }
  const settings = await acpLoadSettings();
  text.value = JSON.stringify(
    { settings, schedules: acpSchedules },
    null,
    2
  );
}

async function acpImportJson(): Promise<void> {
  const text = document.getElementById("io-text");
  const message = document.getElementById("io-message");
  if (!(text instanceof HTMLTextAreaElement)) {
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.value);
  } catch {
    if (message) {
      message.textContent = "Not valid JSON.";
    }
    return;
  }
  const record = (
    typeof raw === "object" && raw !== null ? raw : {}
  ) as { settings?: unknown; schedules?: unknown };
  const settings = acpNormalizeSettings(record.settings);
  acpSchedules = acpNormalizeSchedules(record.schedules);
  await acpSaveSettings(settings);
  await acpSaveSchedules(acpSchedules);
  acpRenderScheduleList();
  if (message) {
    message.textContent =
      "Imported " + acpSchedules.length + " schedule(s).";
  }
}

function acpIoInit(): void {
  const exportButton = document.getElementById("io-export");
  if (exportButton) {
    exportButton.addEventListener("click", () => {
      void acpExportJson();
    });
  }
  const importButton = document.getElementById("io-import");
  if (importButton) {
    importButton.addEventListener("click", () => {
      void acpImportJson();
    });
  }
}

/* One checkbox per schedulable area; checked means that area is set to
   Schedule. This is the same per-rule state the popup dropdown controls,
   so the two stay in step through storage.onChanged. Unchecking returns
   the area to Visible. */
async function acpRenderScheduleAreas(): Promise<void> {
  const host = document.getElementById("schedule-areas");
  if (!host) {
    return;
  }
  const settings = await acpLoadSettings();
  host.textContent = "";
  const rules = ACP_RULES.filter(
    (rule) => rule.shipped && rule.scheduling
  );
  for (const rule of rules) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = settings.rules[rule.id] === "scheduled";
    checkbox.addEventListener("change", () => {
      settings.rules[rule.id] = checkbox.checked ? "scheduled" : "off";
      void acpSaveSettings(settings);
    });
    const text = document.createElement("span");
    text.textContent = rule.label;
    label.appendChild(checkbox);
    label.appendChild(text);
    item.appendChild(label);
    host.appendChild(item);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void acpScheduleEditorInit();
  acpIoInit();
});
