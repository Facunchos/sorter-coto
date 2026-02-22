// api.js — Captura de URL Endeca y scraping de productos via API JSON
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.api = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { cFormatoToUnitType, formatApiPrice, unitLabel } = window.CotoSorter.utils;

  let capturedApiUrl = null;

  // =========================================================
  // Captura de URL Endeca
  // =========================================================

  /** Determina si una URL corresponde a una llamada Endeca/ATG de productos. */
  function isEndecaUrl(rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.origin !== window.location.origin) return false;
      return /\/_\/N-[a-z0-9]+/i.test(u.pathname)
        || u.searchParams.has("Nr")
        || u.searchParams.has("Nf");
    } catch { return false; }
  }

  /** Extrae el path base antes de "/_/N-" para comparar con la página actual. */
  function endecaBasePath(rawUrl) {
    try {
      const decoded = decodeURIComponent(new URL(rawUrl).pathname);
      const nIdx = decoded.indexOf("/_/N-");
      return nIdx !== -1 ? decoded.substring(0, nIdx) : decoded;
    } catch { return ""; }
  }

  /** Retorna true si la URL capturada corresponde a la página visible. */
  function capturedUrlMatchesCurrentPage(url) {
    if (!url) return false;
    const captured = endecaBasePath(url).replace(/\/$/, "");
    const current = decodeURIComponent(window.location.pathname).replace(/\/$/, "");
    return current.startsWith(captured) || captured.startsWith(current);
  }

  /** Busca la última URL Endeca en PerformanceResourceTiming. */
  function findEndecaUrlInPerformance() {
    try {
      const entries = performance.getEntriesByType("resource");
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (
          (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") &&
          isEndecaUrl(entry.name)
        ) {
          return entry.name;
        }
      }
    } catch { /* ignorar */ }
    return null;
  }

  /** Refresca capturedApiUrl con la URL más reciente de Performance. */
  function refreshCapturedUrl() {
    const latest = findEndecaUrlInPerformance();
    if (latest) {
      capturedApiUrl = latest;
      debugLog("[ApiCapture] Refreshed URL:", capturedApiUrl);
    }
  }

  /** Configura captura pasiva de URL Endeca via PerformanceObserver. */
  function setupApiUrlCapture() {
    refreshCapturedUrl();

    if (typeof PerformanceObserver === "undefined") return;

    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (
          (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") &&
          isEndecaUrl(entry.name)
        ) {
          capturedApiUrl = entry.name;
          debugLog("[ApiCapture] Updated URL via PerformanceObserver:", capturedApiUrl);
        }
      }
    });

    obs.observe({ type: "resource", buffered: true });
  }

  // =========================================================
  // Construcción de URL
  // =========================================================

  /** Corrige el path duplicado "/sitios/cdigi/sitios/cdigi/..." que genera COTO. */
  function normalizeEndecaPathDuplication(url) {
    const prefix = "/sitios/cdigi";
    if (url.pathname.startsWith(prefix + prefix)) {
      try {
        const fixed = new URL(url.toString());
        fixed.pathname = url.pathname.slice(prefix.length);
        debugLog(`[normalizeEndecaPath] Fixed doubled path: ${url.pathname} → ${fixed.pathname}`);
        return fixed;
      } catch { /* ignorar */ }
    }
    return url;
  }

  /** Decodifica query params que ATG/Endeca codifica como %3F en el path. */
  function decodePathEncodedParams(url) {
    const rawPath = url.pathname;
    const encodedQmark = rawPath.toLowerCase().indexOf("%3f");
    if (encodedQmark === -1) return url;

    const realPath = rawPath.substring(0, encodedQmark);
    const decodedQuery = decodeURIComponent(rawPath.substring(encodedQmark + 3));
    const existingSearch = url.search ? url.search.substring(1) + "&" : "";
    const cleanHref = url.origin + realPath + "?" + existingSearch + decodedQuery;
    debugLog(`[buildApiUrl] Decoded path-encoded params`);
    return new URL(cleanHref);
  }

  /** Construye la URL de API JSON Endeca con offset y tamaño de página. */
  function buildApiUrl(offset, nrpp) {
    refreshCapturedUrl();

    const useCapture = capturedApiUrl && capturedUrlMatchesCurrentPage(capturedApiUrl);
    if (!useCapture && capturedApiUrl) {
      debugLog("[ApiCapture] Captured URL doesn't match current page, falling back to location.href");
    }

    const baseHref = useCapture ? capturedApiUrl : window.location.href;
    let url = normalizeEndecaPathDuplication(new URL(baseHref));
    url = decodePathEncodedParams(url);

    url.searchParams.set("format", "json");
    url.searchParams.set("No", String(offset));
    url.searchParams.set("Nrpp", String(nrpp));
    url.searchParams.delete("_dyncharset");
    return url.toString();
  }

  // =========================================================
  // Parseo de respuesta
  // =========================================================

  /** Navega la respuesta JSON Endeca para encontrar Category_ResultsList. */
  function findResultsList(data) {
    const page = data?.contents?.[0];
    if (!page) return null;

    const slot = page["Main"];
    if (Array.isArray(slot)) {
      for (const slotItem of slot) {
        if (slotItem["@type"] === "Main_Slot") {
          for (const content of slotItem.contents || []) {
            if (content["@type"] === "Category_ResultsList") return content;
          }
        }
        if (slotItem["@type"] === "Category_ResultsList") return slotItem;
        for (const sub of slotItem.contents || []) {
          if (sub["@type"] === "Category_ResultsList") return sub;
        }
      }
    }
    return null;
  }

  // ---- Parseo de registro individual ----

  /** Extrae info básica del producto: nombre, imagen, precios, formato. */
  function parseBasicInfo(attr) {
    const get = (key) => attr[key]?.[0] ?? null;

    const name = get("product.displayName") || get("sku.displayName") || "Producto";
    const imgSrc = get("product.largeImage.url") || get("product.mediumImage.url");
    const activePrice = parseFloat(get("sku.activePrice") || "0");
    const referencePrice = parseFloat(get("sku.referencePrice") || "0");
    const cFormato = get("product.cFormato") || "";
    const unitType = cFormatoToUnitType(cFormato);
    const priceText = formatApiPrice(activePrice);

    return { name, imgSrc, activePrice, referencePrice, unitType, priceText, get };
  }

  /** Calcula el ratio de descuento a partir de dtoDescuentos o listPrice. */
  function calcDiscountRatio(dtoArr, activePrice, get, name) {
    let discountRatio = 1;

    if (dtoArr.length > 0 && activePrice > 0) {
      let bestEffectivePrice = Infinity;
      for (const dto of dtoArr) {
        const match = (dto.precioDescuento || "").match(/[\d]+(?:\.\d+)?/);
        const pd = match ? parseFloat(match[0]) : NaN;
        if (!isNaN(pd) && pd > 0 && pd < bestEffectivePrice) {
          bestEffectivePrice = pd;
        }
      }
      if (bestEffectivePrice < Infinity && bestEffectivePrice < activePrice) {
        discountRatio = bestEffectivePrice / activePrice;
        debugLog(`[discount] ${name}: bestPrecioDescuento=${bestEffectivePrice} / active=${activePrice} → ratio=${discountRatio.toFixed(4)}`);
      }
    }

    // Fallback: sku.listPrice vs activePrice
    if (discountRatio === 1) {
      const listPrice = parseFloat(get("sku.listPrice") || "0");
      if (listPrice > 0 && activePrice > 0 && activePrice < listPrice) {
        discountRatio = activePrice / listPrice;
        debugLog(`[discount] ${name}: listPrice fallback=${listPrice} → ratio=${discountRatio.toFixed(4)}`);
      }
    }

    return discountRatio;
  }

  /** Extrae badges de texto de dtoDescuentos. */
  function parseBadges(dtoArr) {
    const badges = [];
    for (const dto of dtoArr) {
      if (dto.textoLlevando?.trim()) badges.push(dto.textoLlevando.trim());
      if (dto.textoDescuento?.trim() && !badges.includes(dto.textoDescuento.trim())) {
        badges.push(dto.textoDescuento.trim());
      }
    }
    return badges;
  }

  /** Parsea un registro Endeca al formato de producto interno. */
  function parseEndecaRecord(innerRecord) {
    const attr = innerRecord.attributes || {};
    const { name, imgSrc, activePrice, referencePrice, unitType, priceText, get } = parseBasicInfo(attr);

    // URL del producto
    let href = null;
    const recordState = innerRecord.detailsAction?.recordState;
    if (recordState) {
      href = "https://www.cotodigital.com.ar/sitios/cdigi/productos" + recordState.split("?")[0];
    }

    // Descuentos
    let dtoArr = [];
    try { dtoArr = JSON.parse(get("product.dtoDescuentos") || "[]"); } catch { /* ignorar */ }

    const discountRatio = calcDiscountRatio(dtoArr, activePrice, get, name);
    const hasDiscount = discountRatio < 0.999;

    // Precio de referencia ajustado
    const adjustedReferencePrice = (referencePrice > 0 && hasDiscount)
      ? referencePrice * discountRatio
      : referencePrice;

    // Texto de precio unitario
    let unitPriceText = null;
    if (referencePrice > 0 && unitType) {
      const shortLabel = unitLabel(unitType);
      const priceToShow = hasDiscount ? adjustedReferencePrice : referencePrice;
      unitPriceText = `$/${shortLabel}: ${formatApiPrice(priceToShow)}`;
    }

    const discountedPriceText = hasDiscount ? formatApiPrice(activePrice * discountRatio) : null;
    const badges = parseBadges(dtoArr);

    debugLog(`Parsed: ${name} | price=${priceText} | unit=${unitPriceText} | type=${unitType} | ratio=${discountRatio.toFixed(4)}`);

    return {
      name, href, imgSrc, priceText, discountedPriceText, badges, unitPriceText, unitType,
      activePrice, referencePrice, adjustedReferencePrice, discountRatio,
    };
  }

  // =========================================================
  // Scraping
  // =========================================================

  /** Extrae productos de un resultsList Endeca. */
  function extractProductsFromResultsList(resultsList) {
    const products = [];
    for (const outerRecord of resultsList?.records || []) {
      for (const innerRecord of outerRecord.records || []) {
        try { products.push(parseEndecaRecord(innerRecord)); }
        catch (e) { debugLog("Error parsing record:", e); }
      }
    }
    return products;
  }

  /**
   * Obtiene TODOS los productos de la API Endeca en batches paralelos.
   * @param {Function} progressCallback — (loaded, total) => void
   */
  async function scrapeAllPages(progressCallback) {
    const BATCH = 50;
    const PARALLEL = 3;

    debugLog("Fetching first batch from JSON API...");
    const firstUrl = buildApiUrl(0, BATCH);
    debugLog(`API URL: ${firstUrl}`);

    const firstResp = await fetch(firstUrl, { credentials: "same-origin" });
    if (!firstResp.ok) throw new Error(`API error ${firstResp.status}`);
    const firstData = await firstResp.json();

    const resultsList = findResultsList(firstData);
    if (!resultsList) {
      throw new Error(
        "No se encontró Category_ResultsList en la respuesta. " +
        "¿Estás en una página de categoría o búsqueda de COTO?"
      );
    }

    const totalNumRecs = resultsList.totalNumRecs || 0;
    debugLog(`Total products from API: ${totalNumRecs}`);
    if (progressCallback) progressCallback(0, totalNumRecs);

    const allProducts = extractProductsFromResultsList(resultsList);
    if (progressCallback) progressCallback(allProducts.length, totalNumRecs);
    debugLog(`First batch: ${allProducts.length}/${totalNumRecs} products`);

    // Fetch remaining batches in parallel groups
    const remainingOffsets = [];
    for (let offset = BATCH; offset < totalNumRecs; offset += BATCH) {
      remainingOffsets.push(offset);
    }

    for (let i = 0; i < remainingOffsets.length; i += PARALLEL) {
      const group = remainingOffsets.slice(i, i + PARALLEL);
      const results = await Promise.all(
        group.map(async (offset) => {
          const url = buildApiUrl(offset, BATCH);
          debugLog(`Fetching offset ${offset}: ${url}`);
          const resp = await fetch(url, { credentials: "same-origin" });
          if (!resp.ok) throw new Error(`API error ${resp.status} at offset ${offset}`);
          const data = await resp.json();
          return extractProductsFromResultsList(findResultsList(data));
        })
      );

      for (const batch of results) allProducts.push(...batch);
      if (progressCallback) progressCallback(allProducts.length, totalNumRecs);
      debugLog(`Progress: ${allProducts.length}/${totalNumRecs}`);
    }

    debugLog(`Scraping complete: ${allProducts.length} total products`);
    return allProducts;
  }

  return { setupApiUrlCapture, scrapeAllPages };
})();
