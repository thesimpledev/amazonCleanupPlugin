/*
 * Popup shell: master kill switch plus a slider per shipped rule, laid out
 * in tabs. The first tab holds the shopping assistant and cart together
 * permanently; the other groups get a tab each once a rule in them ships.
 * The tab bar stays hidden while only one tab has content. Saves write
 * straight to storage.sync; storage.onChanged pushes the change into open
 * tabs, so no reload is needed. Quick hide, the status line, and scheduling
 * states land in phase 1.
 */

interface AcpPopupTab {
  label: string;
  groups: readonly AcpRuleGroup[];
}

const ACP_TABS: readonly AcpPopupTab[] = [
  { label: "Main", groups: ["assistant", "cart"] },
  { label: "Sponsored", groups: ["sponsored"] },
  { label: "Navigation", groups: ["navigation"] },
  { label: "Pressure", groups: ["pressure"] },
];

const ACP_GROUP_LABELS: Record<AcpRuleGroup, string> = {
  assistant: "Shopping assistant",
  cart: "Cart",
  sponsored: "Sponsored",
  navigation: "Navigation",
  pressure: "Pressure",
};

function acpRenderGroup(
  group: AcpRuleGroup,
  settings: AcpSettings
): HTMLElement | null {
  const rules = ACP_RULES.filter(
    (rule) => rule.group === group && rule.shipped
  );
  if (rules.length === 0) {
    return null;
  }
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = ACP_GROUP_LABELS[group];
  section.appendChild(heading);
  for (const rule of rules) {
    section.appendChild(acpRenderRule(rule, settings));
  }
  return section;
}

/* Scheduling-capable rules get the three-state select; the rest keep a
   plain checkbox. */
function acpRenderRule(rule: AcpRule, settings: AcpSettings): HTMLElement {
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = rule.label;
  if (rule.scheduling) {
    const select = document.createElement("select");
    for (const state of ["off", "on", "scheduled"] as const) {
      const option = document.createElement("option");
      option.value = state;
      option.textContent = state.charAt(0).toUpperCase() + state.slice(1);
      select.appendChild(option);
    }
    select.value = settings.rules[rule.id] ?? "off";
    select.addEventListener("change", () => {
      settings.rules[rule.id] = select.value as AcpRuleState;
      void acpSaveSettings(settings);
    });
    label.appendChild(text);
    label.appendChild(select);
    label.className = "rule-scheduled";
    return label;
  }
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = settings.rules[rule.id] === "on";
  checkbox.addEventListener("change", () => {
    settings.rules[rule.id] = checkbox.checked ? "on" : "off";
    void acpSaveSettings(settings);
  });
  label.appendChild(checkbox);
  label.appendChild(text);
  return label;
}

/* "4:12 PM" while the end falls on the current local day, "midnight" for an
   end at the coming local midnight, "Dec 25" otherwise. The end instant is
   exclusive, so the day it names comes from the instant just before it. */
function acpFormatUntil(endMillis: number, nowMillis: number): string {
  const lastInstant = new Date(endMillis - 1);
  const now = new Date(nowMillis);
  const sameDay =
    lastInstant.getFullYear() === now.getFullYear() &&
    lastInstant.getMonth() === now.getMonth() &&
    lastInstant.getDate() === now.getDate();
  if (!sameDay) {
    return lastInstant.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  const end = new Date(endMillis);
  if (end.getHours() === 0 && end.getMinutes() === 0) {
    return "midnight";
  }
  return end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

async function acpRenderStatus(settings: AcpSettings): Promise<void> {
  const status = document.getElementById("status");
  if (!status) {
    return;
  }
  const nowMillis = Date.now();
  const local = await acpExt().storage.local.get(ACP_QUICKHIDE_KEY);
  const session = await acpExt().storage.session.get(ACP_QUICKHIDE_KEY);
  if (session[ACP_QUICKHIDE_KEY] === true) {
    status.textContent = "Quick hide active until restart";
    status.hidden = false;
    return;
  }
  const expiry = local[ACP_QUICKHIDE_KEY];
  if (typeof expiry === "number" && expiry > nowMillis) {
    status.textContent =
      "Quick hide active until " + acpFormatUntil(expiry, nowMillis);
    status.hidden = false;
    return;
  }
  const schedules = await acpLoadSchedules();
  const activeWindow = acpActiveWindow(schedules, nowMillis);
  if (activeWindow !== null) {
    const labels = ACP_RULES.filter(
      (rule) =>
        rule.shipped &&
        rule.scheduling &&
        settings.rules[rule.id] === "scheduled"
    ).map((rule) => rule.label);
    if (labels.length > 0) {
      const name = activeWindow.schedule.label;
      status.textContent =
        labels.join(", ") +
        " hidden until " +
        acpFormatUntil(activeWindow.endMillis, nowMillis) +
        (name ? " (" + name + ")" : "");
      status.hidden = false;
      return;
    }
  }
  status.hidden = true;
}

interface AcpTabEntry {
  button: HTMLButtonElement;
  panel: HTMLElement;
}

function acpSelectTab(
  entries: readonly AcpTabEntry[],
  active: AcpTabEntry
): void {
  for (const entry of entries) {
    const selected = entry === active;
    entry.button.classList.toggle("active", selected);
    entry.panel.hidden = !selected;
  }
}

function acpRenderTabs(
  tabsHost: HTMLElement,
  panelsHost: HTMLElement,
  settings: AcpSettings
): void {
  const entries: AcpTabEntry[] = [];
  for (const tab of ACP_TABS) {
    const sections: HTMLElement[] = [];
    for (const group of tab.groups) {
      const section = acpRenderGroup(group, settings);
      if (section) {
        sections.push(section);
      }
    }
    if (sections.length === 0) {
      continue;
    }
    const panel = document.createElement("div");
    panel.className = "tab-panel";
    for (const section of sections) {
      panel.appendChild(section);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.textContent = tab.label;
    const entry: AcpTabEntry = { button, panel };
    button.addEventListener("click", () => {
      acpSelectTab(entries, entry);
    });
    tabsHost.appendChild(button);
    panelsHost.appendChild(panel);
    entries.push(entry);
  }
  if (entries.length > 0) {
    acpSelectTab(entries, entries[0]);
  }
  tabsHost.hidden = entries.length < 2;
}

async function acpPopupInit(): Promise<void> {
  const settings = await acpLoadSettings();
  const master = document.getElementById("master");
  if (master instanceof HTMLInputElement) {
    master.checked = settings.enabled;
    master.addEventListener("change", () => {
      settings.enabled = master.checked;
      void acpSaveSettings(settings);
    });
  }
  const tabsHost = document.getElementById("tabs");
  const groupsHost = document.getElementById("groups");
  if (tabsHost && groupsHost) {
    acpRenderTabs(tabsHost, groupsHost, settings);
  }
  const quickHideButton = document.getElementById("quickhide-start");
  const quickHideDuration = document.getElementById("quickhide-duration");
  if (
    quickHideButton instanceof HTMLButtonElement &&
    quickHideDuration instanceof HTMLSelectElement
  ) {
    quickHideButton.addEventListener("click", () => {
      void acpStartQuickHide(
        quickHideDuration.value as AcpQuickHideChoice,
        Date.now()
      ).then(() => acpRenderStatus(settings));
    });
  }
  void acpRenderStatus(settings);
  const optionsButton = document.getElementById("open-options");
  if (optionsButton) {
    optionsButton.addEventListener("click", () => {
      void acpExt().runtime.openOptionsPage();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void acpPopupInit();
});
