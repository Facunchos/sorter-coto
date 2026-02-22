// revista.js — Agrupación, generación de PDF y flujo de revista
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.revista = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { detectUnitTypeFromProduct, unitTypeSeparatorLabel } = window.CotoSorter.utils;
  const { scrapeAllPages } = window.CotoSorter.api;

  /**
   * Agrupa productos por tipo de unidad y ordena cada grupo de menor a mayor.
   * Orden: Kg → L → 100g → m² → Unidad → Sin categoría
   */
  function groupAndSortProducts(products) {
    const ORDER = ["weight", "volume", "100g", "square", "unit", null];
    const groups = new Map();

    for (const p of products) {
      const type = detectUnitTypeFromProduct(p) || null;
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(p);
    }

    // Ordenar cada grupo por precio unitario ascendente
    for (const [type, prods] of groups) {
      prods.sort((a, b) => {
        const priceA = type
          ? (a.adjustedReferencePrice || a.referencePrice || a.activePrice || Infinity)
          : (a.activePrice || Infinity);
        const priceB = type
          ? (b.adjustedReferencePrice || b.referencePrice || b.activePrice || Infinity)
          : (b.activePrice || Infinity);
        return priceA - priceB;
      });
    }

    const result = [];
    for (const type of ORDER) {
      if (groups.has(type)) {
        result.push({
          unitType: type,
          label: unitTypeSeparatorLabel(type),
          products: groups.get(type),
        });
      }
    }

    return result;
  }

  // ---- Generación de revista imprimible ----

  /**
   * Genera una revista HTML imprimible (alternativa segura para extensiones Firefox).
   */
  async function generateRevistaPDF(products, progressCallback) {
    const groups = groupAndSortProducts(products);
    debugLog(`Grouped into ${groups.length} categories for printable revista`);

    if (progressCallback) {
      progressCallback("pdf", products.length, products.length);
    }

    window.CotoSorter.vistaLigera.generateRevistaHTML(products, {
      printMode: true,
      autoPrint: true,
      title: "Revista Promos — COTO",
    });
  }

  // ---- Flujo principal ----

  /** Flujo completo: scraping → PDF. */
  async function startRevistaGeneration(maxCount, updateProgressFn) {
    try {
      debugLog("Starting Revista Promos generation...");
      updateProgressFn("Consultando API de COTO...", 5);

      let allProducts = await scrapeAllPages((loaded, total) => {
        const pct = total > 0 ? Math.min((loaded / total) * 50, 50) : 10;
        const label = total > 0
          ? `Obteniendo productos (${loaded}/${total})...`
          : "Obteniendo productos...";
        updateProgressFn(label, pct);
      });

      if (allProducts.length === 0) {
        updateProgressFn(null, 0);
        alert("No se encontraron productos en esta página.");
        return;
      }

      debugLog(`Total products scraped: ${allProducts.length}`);

      if (maxCount && maxCount > 0 && maxCount < allProducts.length) {
        allProducts = allProducts.slice(0, maxCount);
        debugLog(`Limited to first ${maxCount} products`);
      }

      updateProgressFn("Preparando revista imprimible...", 55);

      await generateRevistaPDF(allProducts, (stage, current, total) => {
        if (stage === "imgs") {
          const pct = 50 + (current / total) * 30;
          updateProgressFn(`Descargando imágenes (${current}/${total})...`, pct);
        } else {
          const pct = 80 + (current / total) * 20;
          updateProgressFn(`Generando PDF (${current}/${total})...`, pct);
        }
      });

      updateProgressFn("✓ Revista lista para imprimir/guardar en PDF", 100);
      setTimeout(() => updateProgressFn(null, 0), 3000);
    } catch (err) {
      console.error("[CotoSorter] Revista generation error:", err);
      updateProgressFn("✗ Error: " + err.message, 0);
      setTimeout(() => updateProgressFn(null, 0), 5000);
    }
  }

  /** Flujo completo: scraping → Vista HTML en nueva pestaña. */
  async function startRevistaHTMLGeneration(maxCount, updateProgressFn) {
    try {
      debugLog("Starting Revista HTML generation...");
      updateProgressFn("Consultando API de COTO...", 5);

      let allProducts = await scrapeAllPages((loaded, total) => {
        const pct = total > 0 ? Math.min((loaded / total) * 80, 80) : 10;
        const label = total > 0
          ? `Obteniendo productos (${loaded}/${total})...`
          : "Obteniendo productos...";
        updateProgressFn(label, pct);
      });

      if (allProducts.length === 0) {
        updateProgressFn(null, 0);
        alert("No se encontraron productos en esta página.");
        return;
      }

      if (maxCount && maxCount > 0 && maxCount < allProducts.length) {
        allProducts = allProducts.slice(0, maxCount);
        debugLog(`Limited to first ${maxCount} products`);
      }

      updateProgressFn("Generando vista HTML...", 90);
      window.CotoSorter.vistaLigera.generateRevistaHTML(allProducts);

      updateProgressFn("✓ Vista abierta en nueva pestaña", 100);
      setTimeout(() => updateProgressFn(null, 0), 3000);
    } catch (err) {
      console.error("[CotoSorter] Revista HTML generation error:", err);
      updateProgressFn("✗ Error: " + err.message, 0);
      setTimeout(() => updateProgressFn(null, 0), 5000);
    }
  }

  return { groupAndSortProducts, generateRevistaPDF, startRevistaGeneration, startRevistaHTMLGeneration };
})();
