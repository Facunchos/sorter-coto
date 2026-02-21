// ===========================================================
// logger.js — Debug logging y flag de activación
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.logger = (function () {
  "use strict";

  let debugEnabled = false;

  function debugLog(...args) {
    if (debugEnabled) {
      console.log("%c[CotoSorter]", "color:#e20025;font-weight:bold", ...args);
    }
  }

  function initDebugFlag() {
    try {
      chrome.storage.local.get("debug", (result) => {
        debugEnabled = result.debug === true;
        debugLog("Debug mode enabled");
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.debug) {
          debugEnabled = changes.debug.newValue === true;
          debugLog("Debug mode toggled:", debugEnabled);
        }
      });
    } catch {
      // Fuera del contexto de extensión (ej. testing) — ignorar
      debugEnabled = false;
    }
  }

  return { debugLog, initDebugFlag };
})();
