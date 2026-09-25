/*
 * One debounced MutationObserver total, not one per rule. It catches content
 * Amazon injects after first paint and the style writes with which Amazon
 * re-applies the body padding. document.body does not exist at
 * document_start, so attachment waits for it.
 */

const ACP_DEBOUNCE_MILLIS = 100;

let acpDebounceTimer: number | undefined;

function acpOnMutations(): void {
  acpLayoutRepair();
}

function acpDebouncedMutations(): void {
  if (acpDebounceTimer !== undefined) {
    clearTimeout(acpDebounceTimer);
  }
  acpDebounceTimer = setTimeout(acpOnMutations, ACP_DEBOUNCE_MILLIS);
}

function acpAttachObserver(): void {
  const observer = new MutationObserver(acpDebouncedMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style"],
  });
  /* The docked assistant layout arrives as classes on body itself, which
     the subtree observer's style filter does not see. */
  const bodyClassObserver = new MutationObserver(acpDebouncedMutations);
  bodyClassObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  acpOnMutations();
}

function acpObserveStart(): void {
  if (document.body) {
    acpAttachObserver();
    return;
  }
  const bodyWatcher = new MutationObserver(() => {
    if (!document.body) {
      return;
    }
    bodyWatcher.disconnect();
    acpAttachObserver();
  });
  bodyWatcher.observe(document.documentElement, { childList: true });
}
