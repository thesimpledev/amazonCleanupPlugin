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
