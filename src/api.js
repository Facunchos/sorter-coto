// ===========================================================
// api.js — Captura de URL Endeca y scraping de productos via API JSON
// Dependencias: utils, logger
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.api = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { cFormatoToUnitType, formatApiPrice } = window.CotoSorter.utils;

  // ---- Estado interno ----
  let capturedApiUrl = null;

  // ---- Captura de URL Endeca ----

  /**
   * Determina si una URL corresponde a una llamada Endeca/ATG de productos.
   * Matchea el patrón "/_/N-" en el path o query params Nr=/Nf=.
   * Solo considera requests del mismo origen.
   */
  function isEndecaUrl(rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (u.origin !== window.location.origin) return false;
      if (/\/_\/N-[a-z0-9]+/i.test(u.pathname)) return true;
      if (u.searchParams.has("Nr") || u.searchParams.has("Nf")) return true;
      return false;
    } catch { return false; }
  }

  /** Busca en PerformanceResourceTiming una URL Endeca ya cargada. */
  function findEndecaUrlInPerformance() {
    try {
      for (const entry of performance.getEntriesByType("resource")) {
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

  /**
   * Configura captura pasiva de la URL Endeca.
   * Primero revisa entradas existentes en Performance, luego instala
   * un PerformanceObserver para requests futuros.
   */
  function setupApiUrlCapture() {
    const existing = findEndecaUrlInPerformance();
    if (existing) {
      capturedApiUrl = existing;
      debugLog("[ApiCapture] Found existing Endeca URL in performance entries:", capturedApiUrl);
      return;
    }

    if (typeof PerformanceObserver === "undefined") return;

    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (
          (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") &&
          isEndecaUrl(entry.name) &&
          !capturedApiUrl
        ) {
          capturedApiUrl = entry.name;
          debugLog("[ApiCapture] Captured Endeca URL via PerformanceObserver:", capturedApiUrl);
          obs.disconnect();
          break;
        }
      }
    });

    // buffered:true captura entradas previas a la creación del observer
    obs.observe({ type: "resource", buffered: true });
  }

  // ---- Construcción de URL ----

  /**
   * Construye la URL de la API JSON Endeca con offset y tamaño de página.
   * Usa la URL capturada del propio request de la página como base.
   */
  function buildApiUrl(offset, nrpp) {
    let baseHref = capturedApiUrl || window.location.href;
    let url = new URL(baseHref);

    // ATG/Endeca a veces codifica el query string en el path como %3F
    const rawPath = url.pathname;
    const encodedQmark = rawPath.toLowerCase().indexOf("%3f");
    if (encodedQmark !== -1) {
      const realPath = rawPath.substring(0, encodedQmark);
      const decodedQuery = decodeURIComponent(rawPath.substring(encodedQmark + 3));
      const existingSearch = url.search ? url.search.substring(1) + "&" : "";
      const cleanHref = url.origin + realPath + "?" + existingSearch + decodedQuery;
      url = new URL(cleanHref);
      debugLog(`[buildApiUrl] Decoded path-encoded params. Base: ${url.origin + url.pathname + url.search}`);
    }

    url.searchParams.set("format", "json");
    url.searchParams.set("No", String(offset));
    url.searchParams.set("Nrpp", String(nrpp));
    url.searchParams.delete("_dyncharset");
    return url.toString();
  }

  // ---- Parseo de respuesta ----

  /**
   * Navega la respuesta JSON Endeca para encontrar el nodo Category_ResultsList.
   * Retorna null si no lo encuentra.
   */
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

  /**
   * Parsea un registro Endeca (attributes + detailsAction) al formato
   * de producto usado por el módulo revista.
   */
  function parseEndecaRecord(innerRecord) {
    const attr = innerRecord.attributes || {};
    const get = (key) => attr[key]?.[0] ?? null;

    const name = get("product.displayName") || get("sku.displayName") || "Producto";
    const imgSrc = get("product.largeImage.url") || get("product.mediumImage.url");
    const activePriceRaw = parseFloat(get("sku.activePrice") || "0");
    const refPriceRaw = parseFloat(get("sku.referencePrice") || "0");
    const cFormato = get("product.cFormato") || "";
    const unitType = cFormatoToUnitType(cFormato);

    // URL del producto: strip query del recordState, agregar prefijo de COTO
    let href = null;
    const recordState = innerRecord.detailsAction?.recordState;
    if (recordState) {
      const path = recordState.split("?")[0];
      href = "https://www.cotodigital.com.ar/sitios/cdigi/productos" + path;
    }

    const priceText = formatApiPrice(activePriceRaw);

    let unitPriceText = null;
    if (refPriceRaw > 0 && cFormato.trim()) {
      const label = cFormato.trim().replace(/\s+/g, " ");
      unitPriceText = `Precio por 1 ${label}: ${formatApiPrice(refPriceRaw)}`;
    }

    // Badges: tipoOferta (sin "Todas las Ofertas") + textoLlevando de dtoDescuentos
    const badges = (attr["product.tipoOferta"] || [])
      .map((t) => t.trim())
      .filter((t) => t && t !== "Todas las Ofertas");

    try {
      const dtoArr = JSON.parse(get("product.dtoDescuentos") || "[]");
      for (const dto of dtoArr) {
        if (dto.textoLlevando?.trim()) badges.push(dto.textoLlevando.trim());
        if (dto.textoDescuento?.trim() && !badges.includes(dto.textoDescuento.trim())) {
          badges.push(dto.textoDescuento.trim());
        }
      }
    } catch { /* ignorar errores de parse */ }

    debugLog(`Parsed: ${name} | price=${priceText} | unit=${unitPriceText} | type=${unitType}`);

    return { name, href, imgSrc, priceText, badges, unitPriceText, unitType, activePrice: activePriceRaw, referencePrice: refPriceRaw };
  }

  // ---- Scraping ----

  /**
   * Obtiene TODOS los productos de la API Endeca en batches paralelos.
   * El primer request descubre totalNumRecs, luego fetcha el resto en paralelo.
   * @param {Function} progressCallback — (loaded, total) => void
   */
  async function scrapeAllPages(progressCallback) {
    const BATCH = 50;

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

    const allProducts = [];
    for (const outerRecord of resultsList.records || []) {
      for (const innerRecord of outerRecord.records || []) {
        try { allProducts.push(parseEndecaRecord(innerRecord)); }
        catch (e) { debugLog("Error parsing record:", e); }
      }
    }

    if (progressCallback) progressCallback(allProducts.length, totalNumRecs);
    debugLog(`First batch: ${allProducts.length}/${totalNumRecs} products`);

    const remainingOffsets = [];
    for (let offset = BATCH; offset < totalNumRecs; offset += BATCH) {
      remainingOffsets.push(offset);
    }

    const PARALLEL = 3;
    for (let i = 0; i < remainingOffsets.length; i += PARALLEL) {
      const group = remainingOffsets.slice(i, i + PARALLEL);
      const results = await Promise.all(
        group.map(async (offset) => {
          const url = buildApiUrl(offset, BATCH);
          debugLog(`Fetching offset ${offset}: ${url}`);
          const resp = await fetch(url, { credentials: "same-origin" });
          if (!resp.ok) throw new Error(`API error ${resp.status} at offset ${offset}`);
          const data = await resp.json();
          const rl = findResultsList(data);
          const products = [];
          for (const outerRecord of rl?.records || []) {
            for (const innerRecord of outerRecord.records || []) {
              try { products.push(parseEndecaRecord(innerRecord)); }
              catch (e) { debugLog("Error parsing record:", e); }
            }
          }
          return products;
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
