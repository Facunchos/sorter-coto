// Popup script — manages debug/extras toggles via chrome.storage.local
(function () {
  "use strict";

  const debugToggle = document.getElementById("debug-toggle");
  const extrasToggle = document.getElementById("extras-toggle");

  // Load current state
  chrome.storage.local.get(["debug", "extras"], (result) => {
    debugToggle.checked = result.debug === true;
    extrasToggle.checked = result.extras === true;
  });

  // Save on change
  debugToggle.addEventListener("change", () => {
    chrome.storage.local.set({ debug: debugToggle.checked });
  });

  extrasToggle.addEventListener("change", () => {
    chrome.storage.local.set({ extras: extrasToggle.checked });
  });
})();
