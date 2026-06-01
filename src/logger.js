// logger.js — Debug logging controlado por chrome.storage
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
    // Prefer chrome.storage when available (extension context). If not
    // available (page console), fall back to localStorage so users can
    // enable debug from the page.
    try {
      if (window.chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get("debug", (result) => {
          debugEnabled = result && result.debug === true;
          if (debugEnabled) debugLog("Debug mode enabled (chrome.storage)");
        });
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === "local" && changes.debug) {
            debugEnabled = changes.debug.newValue === true;
            debugLog("Debug mode toggled (chrome.storage):", debugEnabled);
          }
        });
        return;
      }
    } catch (e) {
      /* ignore and fall back to localStorage */
    }

    try {
      const raw = localStorage.getItem('cotoSorterDebug');
      debugEnabled = raw === '1' || raw === 'true';
      if (debugEnabled) debugLog('Debug mode enabled (localStorage)');
      window.addEventListener('storage', (ev) => {
        if (ev.key === 'cotoSorterDebug') {
          debugEnabled = ev.newValue === '1' || ev.newValue === 'true';
          debugLog('Debug mode toggled (localStorage):', debugEnabled);
        }
      });
    } catch (e) {
      debugEnabled = false;
    }
  }

  return { debugLog, initDebugFlag };
})();
