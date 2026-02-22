// sorter.js — Ordenamiento de productos en pantalla
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.sorter = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { extractProductData, injectAllBadges, removeAllBadges } = window.CotoSorter.badges;

  let isSorting = false;
  let currentFilter = null;
  const originalOrder = new Map();
  let originalOrderSaved = false;

  function getIsSorting() { return isSorting; }
  function getCurrentFilter() { return currentFilter; }

  /**
   * Ordena los cards por precio unitario ajustado (ascendente).
   * Productos sin el tipo indicado quedan al final.
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

  /** Restablece los productos a su orden original. */
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
