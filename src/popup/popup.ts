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
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = settings.rules[rule.id] === true;
    checkbox.addEventListener("change", () => {
      settings.rules[rule.id] = checkbox.checked;
      void acpSaveSettings(settings);
    });
    const text = document.createElement("span");
    text.textContent = rule.label;
    label.appendChild(checkbox);
    label.appendChild(text);
    section.appendChild(label);
  }
  return section;
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
