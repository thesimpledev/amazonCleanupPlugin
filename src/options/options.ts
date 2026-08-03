/*
 * Options shell. Phase 1 adds the schedule editor and JSON import/export;
 * a later phase adds marketplace enabling via optional host permissions.
 * For now the page lists the marketplaces so the shell renders something
 * real.
 */

function acpOptionsInit(): void {
  const list = document.getElementById("marketplaces");
  if (!list) {
    return;
  }
  for (const marketplace of ACP_MARKETPLACES) {
    const item = document.createElement("li");
    item.textContent = marketplace.defaultEnabled
      ? marketplace.host + " (enabled)"
      : marketplace.host;
    if (marketplace.defaultEnabled) {
      item.className = "enabled";
    }
    list.appendChild(item);
  }
}

document.addEventListener("DOMContentLoaded", acpOptionsInit);
