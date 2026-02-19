// Popup script — manages debug toggle via chrome.storage.local
(function () {
  "use strict";

  const toggle = document.getElementById("debug-toggle");

  // Load current state
  chrome.storage.local.get("debug", (result) => {
    toggle.checked = result.debug === true;
  });

  // Save on change
  toggle.addEventListener("change", () => {
    chrome.storage.local.set({ debug: toggle.checked });
  });
})();
