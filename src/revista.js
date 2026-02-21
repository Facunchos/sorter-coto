// ===========================================================
// revista.js — Agrupación, generación de PDF y flujo de revista
// Dependencias: utils, logger, api
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.revista = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { detectUnitTypeFromProduct, unitTypeSeparatorLabel } = window.CotoSorter.utils;
  const { scrapeAllPages } = window.CotoSorter.api;

  // ---- Agrupación y ordenamiento ----

  /**
   * Agrupa productos por tipo de unidad y ordena cada grupo de menor a mayor precio.
   * Orden de grupos: Kg → L → 100g → m² → Unidad → Sin categoría
   * @returns {{ unitType: string|null, label: string, products: object[] }[]}
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
          ? (a.referencePrice || a.activePrice || Infinity)
          : (a.activePrice || Infinity);
        const priceB = type
          ? (b.referencePrice || b.activePrice || Infinity)
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

  // ---- Descarga de imágenes ----

  /**
   * Descarga una imagen y retorna su base64 data URL. Null si falla.
   */
  async function fetchImageAsBase64(url) {
    try {
      const resp = await fetch(url, { credentials: "same-origin" });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  // ---- Generación de PDF ----

  /**
   * Genera el PDF "revista" con todos los productos agrupados por categoría.
   * Cada grupo comienza con una página separadora a pantalla completa,
   * seguida por páginas de productos ordenados por precio ascendente.
   * @param {object[]} products — lista completa de productos
   * @param {Function} progressCallback — (stage: "imgs"|"pdf", current, total) => void
   */
  async function generateRevistaPDF(products, progressCallback) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      alert("Error: jsPDF no está disponible.");
      return;
    }

    // A4 apaisado
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();  // ~297
    const pageH = doc.internal.pageSize.getHeight(); // ~210

    // Config de layout
    const COLS = 6;
    const MARGIN = 10;
    const HEADER_H = 18;
    const GAP = 6;
    const cellW = (pageW - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
    const IMG_H = 30;
    const CELL_H = 62;
    const ROWS_PER_PAGE = Math.floor((pageH - MARGIN - HEADER_H - GAP) / (CELL_H + GAP));
    const PRODUCTS_PER_PAGE = COLS * ROWS_PER_PAGE;

    const groups = groupAndSortProducts(products);
    debugLog(`Grouped into ${groups.length} categories for PDF`);

    // Calcular total de páginas: 1 separadora + páginas de productos por grupo
    let totalPdfPages = 0;
    for (const group of groups) {
      totalPdfPages += 1;
      totalPdfPages += Math.ceil(group.products.length / PRODUCTS_PER_PAGE);
    }

    // Pre-cargar imágenes en batches
    if (progressCallback) progressCallback("imgs", 0, 1);
    const imageCache = {};
    const IMG_BATCH = 8;
    for (let i = 0; i < products.length; i += IMG_BATCH) {
      const batch = products.slice(i, i + IMG_BATCH);
      const results = await Promise.all(
        batch.map((p) => (p.imgSrc ? fetchImageAsBase64(p.imgSrc) : Promise.resolve(null)))
      );
      for (let j = 0; j < batch.length; j++) {
        if (results[j]) imageCache[batch[j].imgSrc] = results[j];
      }
      if (progressCallback) {
        progressCallback("imgs", Math.min(i + IMG_BATCH, products.length), products.length);
      }
    }

    // ---- Helpers de dibujo ----

    function drawHeader(pageNum, groupLabel) {
      doc.setFillColor(226, 0, 37);
      doc.rect(0, 0, pageW, HEADER_H, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("COTO — Revista de Promos", MARGIN, 11);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const dateStr = new Date().toLocaleDateString("es-AR", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      doc.text(dateStr, pageW - MARGIN, 8, { align: "right" });
      doc.text(`${groupLabel} — Pág. ${pageNum}/${totalPdfPages}`, pageW - MARGIN, 14, { align: "right" });
    }

    function drawSeparatorPage(label, productCount, pageNum) {
      doc.setFillColor(226, 0, 37);
      doc.rect(0, 0, pageW, pageH, "F");

      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1);
      const lineMargin = 40;
      const centerY = pageH / 2;
      doc.line(lineMargin, centerY - 25, pageW - lineMargin, centerY - 25);
      doc.line(lineMargin, centerY + 18, pageW - lineMargin, centerY + 18);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(42);
      doc.setFont("helvetica", "bold");
      doc.text(label, pageW / 2, centerY, { align: "center" });

      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.text(
        `${productCount} producto${productCount !== 1 ? "s" : ""} — ordenados de menor a mayor`,
        pageW / 2, centerY + 12, { align: "center" }
      );

      doc.setFontSize(9);
      doc.text(`Pág. ${pageNum}/${totalPdfPages}`, pageW - MARGIN, pageH - 8, { align: "right" });
    }

    function drawProductCell(p, x, y) {
      // Fondo
      doc.setFillColor(255, 255, 245);
      doc.roundedRect(x, y, cellW, CELL_H, 2, 2, "F");

      // Borde
      doc.setDrawColor(226, 0, 37);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cellW, CELL_H, 2, 2, "S");

      // Imagen
      const imgData = p.imgSrc ? imageCache[p.imgSrc] : null;
      if (imgData) {
        try {
          const imgX = x + (cellW - IMG_H) / 2;
          doc.addImage(imgData, "JPEG", imgX, y + 1, IMG_H, IMG_H);
        } catch { /* ignorar */ }
      }

      // Nombre
      const nameY = y + IMG_H + 3;
      doc.setTextColor(33, 33, 33);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      let displayName = p.name || "Producto";
      if (displayName.length > 50) displayName = displayName.substring(0, 47) + "...";
      const nameLines = doc.splitTextToSize(displayName, cellW - 4);
      doc.text(nameLines.slice(0, 2), x + 2, nameY);

      // Precio
      const priceY = nameY + Math.min(nameLines.length, 2) * 3 + 1;
      if (p.priceText) {
        doc.setTextColor(226, 0, 37);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(p.priceText, x + 2, priceY);
      }

      // Badges de oferta
      if (p.badges.length > 0) {
        const badgeText = p.badges.join(" | ");
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        const badgeW = doc.getTextWidth(badgeText) + 4;
        const badgeX = x + cellW - badgeW - 2;
        const badgeY = y + 1;
        doc.setFillColor(226, 0, 37);
        doc.roundedRect(badgeX, badgeY, badgeW, 4.5, 1, 1, "F");
        doc.text(badgeText, badgeX + 2, badgeY + 3.3);
      }

      // Precio unitario (pie de celda)
      if (p.unitPriceText) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        let upt = p.unitPriceText;
        if (upt.length > 55) upt = upt.substring(0, 52) + "...";
        doc.text(upt, x + 2, y + CELL_H - 2);
      }

      // Link clickeable sobre toda la celda
      if (p.href) {
        doc.link(x, y, cellW, CELL_H, { url: p.href });
      }
    }

    // ---- Renderizado ----

    let pdfPage = 1;
    let isFirstPage = true;
    let totalProductsRendered = 0;

    for (const group of groups) {
      // Página separadora
      if (!isFirstPage) doc.addPage();
      isFirstPage = false;
      drawSeparatorPage(group.label, group.products.length, pdfPage);
      pdfPage++;

      // Páginas de productos del grupo
      for (let i = 0; i < group.products.length; i++) {
        if (i % PRODUCTS_PER_PAGE === 0) {
          doc.addPage();
          drawHeader(pdfPage, group.label);
          pdfPage++;
        }

        const col = i % COLS;
        const rowOnPage = Math.floor((i % PRODUCTS_PER_PAGE) / COLS);
        const x = MARGIN + col * (cellW + GAP);
        const y = HEADER_H + GAP + rowOnPage * (CELL_H + GAP);

        drawProductCell(group.products[i], x, y);

        totalProductsRendered++;
        if (progressCallback) progressCallback("pdf", totalProductsRendered, products.length);
      }
    }

    const dateSlug = new Date().toISOString().slice(0, 10);
    doc.save(`revista-promos-COTO-${dateSlug}.pdf`);
  }

  // ---- Flujo principal ----

  /**
   * Flujo completo: scraping → PDF.
   * @param {number|null} maxCount — límite de productos, null para todos
   * @param {Function} updateProgressFn — (text, pct) => void (viene de ui.js)
   */
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

      updateProgressFn("Descargando imágenes...", 55);

      await generateRevistaPDF(allProducts, (stage, current, total) => {
        if (stage === "imgs") {
          const pct = 50 + (current / total) * 30;
          updateProgressFn(`Descargando imágenes (${current}/${total})...`, pct);
        } else {
          const pct = 80 + (current / total) * 20;
          updateProgressFn(`Generando PDF (${current}/${total})...`, pct);
        }
      });

      updateProgressFn("✓ PDF generado con éxito", 100);
      setTimeout(() => updateProgressFn(null, 0), 3000);
    } catch (err) {
      console.error("[CotoSorter] Revista generation error:", err);
      updateProgressFn("✗ Error: " + err.message, 0);
      setTimeout(() => updateProgressFn(null, 0), 5000);
    }
  }

  return { groupAndSortProducts, generateRevistaPDF, startRevistaGeneration };
})();
