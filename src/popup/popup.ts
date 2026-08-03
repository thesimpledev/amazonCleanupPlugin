/*
 * Popup shell: master kill switch plus a slider per rule, grouped by
 * category. Saves write straight to storage.sync; storage.onChanged pushes
 * the change into open tabs, so no reload is needed. Quick hide, the status
 * line, and scheduling states land in phase 1.
 */

const ACP_GROUP_ORDER: readonly AcpRuleGroup[] = [
  "assistant",
  "cart",
  "sponsored",
  "navigation",
  "pressure",
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
  const rules = ACP_RULES.filter((rule) => rule.group === group);
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
  const groupsHost = document.getElementById("groups");
  if (groupsHost) {
    for (const group of ACP_GROUP_ORDER) {
      const section = acpRenderGroup(group, settings);
      if (section) {
        groupsHost.appendChild(section);
      }
    }
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
