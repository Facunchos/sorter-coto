// Coto Sorter — Content Script (Entry Point)
(function () {
  "use strict";

  const { DEBOUNCE_MS, BADGE_ATTR } = window.CotoSorter.utils;
  const { debugLog, initDebugFlag } = window.CotoSorter.logger;
  const { injectBadgeOnProduct, injectAllBadges } = window.CotoSorter.badges;
  const { getIsSorting, getCurrentFilter, sortProducts } = window.CotoSorter.sorter;
  const { setupApiUrlCapture } = window.CotoSorter.api;
  function getUIModule() {
    return window.CotoSorter.ui || null;
  }

  function getShoppingListModule() {
    return window.CotoSorter.shoppingList || null;
  }

  function isRecaptchaTimeoutError(reason) {
    const message = String(reason?.message || reason || "");
    return /reCAPTCHA\s+Timeout/i.test(message);
  }

  function setupRejectionGuards() {
    window.addEventListener("unhandledrejection", (event) => {
      debugLog("Unhandled promise rejection", {
        url: window.location.href,
        message: String(event?.reason?.message || event?.reason || ""),
      });

      if (!isRecaptchaTimeoutError(event?.reason)) {
        return;
      }

      debugLog("Ignored site reCAPTCHA timeout rejection", {
        url: window.location.href,
        message: String(event?.reason?.message || event?.reason || ""),
      });
      event.preventDefault();
    });

    window.addEventListener("error", (event) => {
      debugLog("Window error", {
        url: window.location.href,
        message: String(event?.message || event?.error?.message || ""),
        source: event?.filename || null,
        line: event?.lineno || null,
        column: event?.colno || null,
      });
    });
  }

  // ---- MutationObserver ----
  let observer = null;
  let debounceTimer = null;

  function setupObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (getIsSorting()) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const currentFilter = getCurrentFilter();
        if (currentFilter) {
          // Re-aplicar sort para integrar productos nuevos
          sortProducts(currentFilter);
        } else {
          const unprocessed = document.querySelectorAll(
            `.producto-card:not([${BADGE_ATTR}="done"])`
          );
          if (unprocessed.length > 0) {
            unprocessed.forEach(injectBadgeOnProduct);
          }
        }
      }, DEBOUNCE_MS);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    debugLog("MutationObserver started");
  }

  function teardownObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
      clearTimeout(debounceTimer);
      debugLog("MutationObserver disconnected");
    }
  }

  // ---- Inicialización ----

  function init() {
    debugLog("Initializing Coto Sorter");

    try {
      document.documentElement.setAttribute("data-coto-sorter-loaded", "true");
    } catch {
      /* ignore */
    }

    setupRejectionGuards();
    setupApiUrlCapture();
    const uiModule = getUIModule();
    if (uiModule && typeof uiModule.injectUI === "function") {
      uiModule.injectUI();
    } else {
      debugLog("UI module not ready; panel injection skipped");
    }
    setupObserver();
    const shoppingListModule = getShoppingListModule();
    if (shoppingListModule) {
      // Run migrations for favorites storage if available, then possibly auto-run batch
      try {
        if (typeof shoppingListModule?.migrateFavoritesIfNeeded === "function") {
          // shoppingList doesn't expose migration directly; try favorites module
        }
        const favModule = window.CotoSorter?.favorites;
        if (favModule && typeof favModule.migrateFavoritesIfNeeded === "function") {
          favModule.migrateFavoritesIfNeeded().then((migrated) => {
            if (migrated) debugLog("Favorites migrated to include last-seen snapshot fields");
          }).catch(() => {});
        }

        if (typeof shoppingListModule.maybeAutoRunBatch === "function") {
          shoppingListModule.maybeAutoRunBatch();
        }
      } catch (err) {
        try { shoppingListModule.maybeAutoRunBatch(); } catch (e) { /* ignore */ }
      }
    }

    // Inyectar badges iniciales tras render de Angular
    setTimeout(() => {
      const products = document.querySelectorAll(".producto-card");
      if (products.length > 0) {
        injectAllBadges();
      } else {
        debugLog("No products found yet, observer will handle them");
      }
    }, 500);
  }

  // Primero el flag de debug, luego arrancar
  initDebugFlag();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Limpieza al salir de la página sin depender de `unload`.
  window.addEventListener("pagehide", teardownObserver);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      teardownObserver();
    }
  });
})();
