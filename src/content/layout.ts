/*
 * Amazon sets inline padding-right on body to reserve room for the cart
 * sidebar and the Alexa panel. When a rule with that layout fix is hidden,
 * the padding is a dead margin, so it is cleared. Amazon's scripts re-apply
 * it, so this runs from the mutation observer, not once, and is idempotent.
 */

function acpLayoutRepair(): void {
  const body = document.body;
  if (!body) {
    return;
  }
  acpStripDockedClasses(body);
  const root = document.documentElement;
  const needsFix = ACP_RULES.some(
    (rule) =>
      rule.layoutFix === "resetBodyPadding" &&
      root.classList.contains(acpRuleClass(rule.id))
  );
  if (!needsFix) {
    return;
  }
  if (body.style.paddingRight !== "") {
    body.style.paddingRight = "";
  }
}

/*
 * Amazon's docked assistant layouts are switched on by classes on body and
 * reserve the panel's room with body padding, offset the search dropdown
 * backdrop and the sticky subnav, and pad the cart flyout around the panel.
 * With the panel hidden there is nothing to lay out around, so the classes
 * are stripped and Amazon's normal layout takes over, which the padding
 * reset above already handles. Amazon may put the classes back, so this
 * runs from the observer as well and is idempotent.
 */

const ACP_DOCKED_CLASSES: readonly string[] = [
  "rufus-docked-left",
  "rufus-docked-right",
  "rufus-docked-adjustable",
];

function acpStripDockedClasses(body: HTMLElement): void {
  const root = document.documentElement;
  if (!root.classList.contains(acpRuleClass("alexa-shopping"))) {
    return;
  }
  for (const name of ACP_DOCKED_CLASSES) {
    if (body.classList.contains(name)) {
      body.classList.remove(name);
    }
  }
}
