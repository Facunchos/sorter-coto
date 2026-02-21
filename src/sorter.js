// ===========================================================
// sorter.js — Ordenamiento de productos en pantalla
// Dependencias: badges, logger
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.sorter = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { extractProductData, injectAllBadges, removeAllBadges } = window.CotoSorter.badges;

  // ---- Estado interno ----
  let isSorting = false;
  let currentFilter = null;
  const originalOrder = new Map();
  let originalOrderSaved = false;

  // ---- Getters de estado (para el observer en content.js) ----
  function getIsSorting() { return isSorting; }
  function getCurrentFilter() { return currentFilter; }

  // ---- Sorting ----

  /**
   * Ordena los cards de producto por precio unitario ajustado (ascendente).
   * Los productos sin el tipo de unidad indicado se dejan al final.
   * @param {string} filterType — "weight" | "volume" | "100g" | "square" | "unit"
   * @param {Function} [onComplete] — callback opcional luego de ordenar (ej. updateButtonStates)
   */
  function sortProducts(filterType, onComplete) {
    const container = document.querySelector(".productos.row");
    if (!container) {
      debugLog("ERROR: Product container .productos.row not found");
      return;
    }

    isSorting = true;
    currentFilter = filterType;

    const wrappers = Array.from(container.querySelectorAll(":scope > .producto-card"));
    debugLog(`Sorting ${wrappers.length} product wrappers by ${filterType}`);

    // Guardar orden original en el primer sort
    if (!originalOrderSaved) {
      wrappers.forEach((w, i) => originalOrder.set(w, i));
      originalOrderSaved = true;
      debugLog("Original order saved");
    }

    const items = wrappers.map((wrapper) => {
      const productEl = wrapper.querySelector("catalogue-product");
      const data = productEl ? extractProductData(productEl) : null;
      return { wrapper, data };
    });

    const withPrice = [];
    const withoutPrice = [];

    for (const item of items) {
      if (item.data && item.data.unitType === filterType) {
        withPrice.push(item);
      } else {
        withoutPrice.push(item);
      }
    }

    withPrice.sort((a, b) => a.data.adjustedUnitPrice - b.data.adjustedUnitPrice);

    const sorted = [...withPrice, ...withoutPrice];
    for (const item of sorted) {
      container.appendChild(item.wrapper);
    }

    debugLog(
      `Sort complete. ${withPrice.length} products with ${filterType} price, ` +
      `${withoutPrice.length} without.`
    );

    injectAllBadges();
    if (onComplete) onComplete();

    requestAnimationFrame(() => { isSorting = false; });
  }

  /**
   * Restablece los productos a su orden original.
   * @param {Function} [onComplete] — callback opcional (ej. updateButtonStates)
   */
  function resetOrder(onComplete) {
    if (!originalOrderSaved) return;

    const container = document.querySelector(".productos.row");
    if (!container) return;

    isSorting = true;
    currentFilter = null;

    const wrappers = Array.from(container.querySelectorAll(":scope > .producto-card"));

    wrappers.sort((a, b) => {
      const ia = originalOrder.get(a) ?? Infinity;
      const ib = originalOrder.get(b) ?? Infinity;
      return ia - ib;
    });

    for (const w of wrappers) {
      container.appendChild(w);
    }

    removeAllBadges();
    if (onComplete) onComplete();
    debugLog("Order reset to original");

    requestAnimationFrame(() => { isSorting = false; });
  }

  return { getIsSorting, getCurrentFilter, sortProducts, resetOrder };
})();
