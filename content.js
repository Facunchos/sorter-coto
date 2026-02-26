// Coto Sorter — Content Script (Entry Point)
(function () {
  "use strict";

  const { DEBOUNCE_MS, BADGE_ATTR } = window.CotoSorter.utils;
  const { debugLog, initDebugFlag } = window.CotoSorter.logger;
  const { injectBadgeOnProduct, injectAllBadges } = window.CotoSorter.badges;
  const { getIsSorting, getCurrentFilter, sortProducts } = window.CotoSorter.sorter;
  const { setupApiUrlCapture } = window.CotoSorter.api;
  const { injectUI } = window.CotoSorter.ui;

  // ---- MutationObserver ----
  let observer = null;
  let debounceTimer = null;

  function setupObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (getIsSorting()) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debugLog("DOM mutation detected, processing new products...");

        const currentFilter = getCurrentFilter();
        if (currentFilter) {
          // Re-aplicar sort para integrar productos nuevos
          sortProducts(currentFilter);
        } else {
          const unprocessed = document.querySelectorAll(
            `.producto-card:not([${BADGE_ATTR}])`
          );
          if (unprocessed.length > 0) {
            debugLog(`Found ${unprocessed.length} new products, injecting badges`);
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

    setupApiUrlCapture();
    injectUI();
    setupObserver();

    // Inyectar badges iniciales tras render de Angular
    setTimeout(() => {
      const products = document.querySelectorAll(".producto-card");
      if (products.length > 0) {
        debugLog(`Found ${products.length} products on page load`);
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

  // Limpieza al salir de la página
  window.addEventListener("unload", teardownObserver);
})();
