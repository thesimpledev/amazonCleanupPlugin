/*
 * The rule catalogue. One entry here plus one CSS block in rules.css is a
 * working, toggleable cleanup. Selectors are read off live pages in the
 * phase that ships each rule (phase 1 for assistant and cart, phase 2 for
 * the rest), so they start empty.
 */

type AcpRuleGroup =
  | "assistant"
  | "cart"
  | "sponsored"
  | "navigation"
  | "pressure";

type AcpLayoutFix = "resetBodyPadding";

interface AcpRule {
  id: string;
  group: AcpRuleGroup;
  label: string;
  defaultOn: boolean;
  /* False until the rule's phase ships working selectors. Unshipped rules
     stay in the catalogue but out of the popup, so the UI never shows dead
     toggles. */
  shipped: boolean;
  scheduling: boolean;
  selectors: string[];
  layoutFix?: AcpLayoutFix;
}

const ACP_RULES: readonly AcpRule[] = [
  {
    id: "alexa-shopping",
    group: "assistant",
    label: "Shopping assistant",
    defaultOn: true,
    shipped: true,
    scheduling: false,
    selectors: [],
    layoutFix: "resetBodyPadding",
  },
  {
    id: "cart-sidebar",
    group: "cart",
    label: "Cart sidebar",
    defaultOn: true,
    shipped: true,
    scheduling: true,
    selectors: [],
    layoutFix: "resetBodyPadding",
  },
  {
    id: "cart-count",
    group: "cart",
    label: "Cart count badge",
    defaultOn: false,
    shipped: false,
    scheduling: true,
    selectors: [],
  },
  {
    id: "recently-viewed",
    group: "cart",
    label: "Recently viewed",
    defaultOn: false,
    shipped: false,
    scheduling: true,
    selectors: [],
  },
  {
    id: "buy-again",
    group: "cart",
    label: "Buy again",
    defaultOn: false,
    shipped: false,
    scheduling: true,
    selectors: [],
  },
  {
    id: "recommendations",
    group: "cart",
    label: "Recommendations",
    defaultOn: false,
    shipped: false,
    scheduling: true,
    selectors: [],
  },
  {
    id: "sponsored-results",
    group: "sponsored",
    label: "Sponsored search results",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "sponsored-carousels",
    group: "sponsored",
    label: "Sponsored carousels",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "sponsored-brands",
    group: "sponsored",
    label: "Sponsored brand banners",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "sponsored-video",
    group: "sponsored",
    label: "Sponsored video",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "site-stripe",
    group: "navigation",
    label: "Site stripe",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "nav-flyouts",
    group: "navigation",
    label: "Navigation flyouts",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "left-nav-ads",
    group: "navigation",
    label: "Left nav ads",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "urgency",
    group: "pressure",
    label: "Urgency banners",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "prime-upsell",
    group: "pressure",
    label: "Prime upsells",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "subscribe-save",
    group: "pressure",
    label: "Subscribe and Save",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "audible-music",
    group: "pressure",
    label: "Audible and Music upsells",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
  {
    id: "insurance-warranty",
    group: "pressure",
    label: "Insurance and warranty offers",
    defaultOn: false,
    shipped: false,
    scheduling: false,
    selectors: [],
  },
];

function acpRuleClass(ruleId: string): string {
  return "acp-" + ruleId;
}

/*
 * In the browser all these files share one global scope, but Node's require
 * isolates each file, so settings.js can only see the catalogue through the
 * global object. Bare references resolve to these in Node; in the browser
 * the lexical declarations above win. Harmless there.
 */
(globalThis as unknown as Record<string, unknown>)["ACP_RULES"] = ACP_RULES;
(globalThis as unknown as Record<string, unknown>)["acpRuleClass"] =
  acpRuleClass;
