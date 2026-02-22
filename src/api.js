// ===========================================================
// api.js — Captura de URL Endeca y scraping de productos via API JSON
// Dependencias: utils, logger
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.api = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { cFormatoToUnitType, formatApiPrice, unitLabel } = window.CotoSorter.utils;

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

  /**
   * Extrae el path base de una URL de Endeca para comparar con la página actual.
   * Ej: "/catalogo-bebidas-bebidas-con-alcohol-cerveza/_/N-137sk0z" → "/catalogo-bebidas-bebidas-con-alcohol-cerveza"
   */
  function endecaBasePath(rawUrl) {
    try {
      const pathname = new URL(rawUrl).pathname;
      // El path puede estar codificado (%3F), decodificar antes de cortar
      const decoded = decodeURIComponent(pathname);
      const nIdx = decoded.indexOf("/_/N-");
      return nIdx !== -1 ? decoded.substring(0, nIdx) : decoded;
    } catch { return ""; }
  }

  /**
   * Retorna true si la URL capturada corresponde a la página actualmente visible.
   * Compara el path base de la URL Endeca contra window.location.pathname.
   */
  function capturedUrlMatchesCurrentPage(url) {
    if (!url) return false;
    const captured = endecaBasePath(url).replace(/\/$/, "");
    const current  = decodeURIComponent(window.location.pathname).replace(/\/$/, "");
    return current.startsWith(captured) || captured.startsWith(current);
  }

  /**
   * Busca en PerformanceResourceTiming la última URL Endeca registrada
   * (la más reciente, no la primera, para capturar cambios de búsqueda).
   */
  function findEndecaUrlInPerformance() {
    try {
      const entries = performance.getEntriesByType("resource");
      // Recorrer en reversa para obtener la más reciente
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

  /**
   * Refresca capturedApiUrl buscando la URL más reciente que corresponda
   * a la página actual. Llamar antes de iniciar un scraping.
   */
  function refreshCapturedUrl() {
    const latest = findEndecaUrlInPerformance();
    if (latest) {
      capturedApiUrl = latest;
      debugLog("[ApiCapture] Refreshed URL:", capturedApiUrl);
    }
  }

  /**
   * Configura captura pasiva de la URL Endeca.
   * El PerformanceObserver permanece activo toda la sesión y siempre
   * actualiza capturedApiUrl con la última URL vista (sin desconectarse).
   */
  function setupApiUrlCapture() {
    // Captura inicial desde el buffer de Performance
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
          // No desconectarse: seguir observando para futuros cambios de búsqueda
        }
      }
    });

    obs.observe({ type: "resource", buffered: true });
  }

  // ---- Construcción de URL ----

  /**
   * Corrige el path duplicado que genera COTO al buscar desde el home.
   * Cuando la página base es /sitios/cdigi/ y el XHR interno de COTO usa
   * un path relativo sin barra inicial (ej: "sitios/cdigi/categoria/..."),
   * el navegador lo resuelve como /sitios/cdigi/sitios/cdigi/categoria/...
   * y esa URL malformada queda registrada en el buffer de Performance.
   * Esta función detecta y elimina el segmento duplicado.
   */
  function normalizeEndecaPathDuplication(url) {
    const path = url.pathname;
    const prefix = "/sitios/cdigi";
    if (path.startsWith(prefix + prefix)) {
      try {
        const fixed = new URL(url.toString());
        fixed.pathname = path.slice(prefix.length);
        debugLog(`[normalizeEndecaPath] Fixed doubled path: ${path} → ${fixed.pathname}`);
        return fixed;
      } catch { /* ignorar */ }
    }
    return url;
  }

  /**
   * Construye la URL de la API JSON Endeca con offset y tamaño de página.
   * Siempre refresca la URL capturada antes de construir para asegurarse
   * de usar la de la página actual (no una búsqueda anterior).
   */
  function buildApiUrl(offset, nrpp) {
    // Re-escanear Performance por si hubo cambio de búsqueda desde la última vez
    refreshCapturedUrl();

    // Validar que la URL capturada corresponde a la página actual;
    // si no, caer a window.location.href para evitar mezclar búsquedas.
    const useCapture = capturedApiUrl && capturedUrlMatchesCurrentPage(capturedApiUrl);
    if (!useCapture && capturedApiUrl) {
      debugLog("[ApiCapture] Captured URL doesn't match current page, falling back to location.href");
    }

    let baseHref = useCapture ? capturedApiUrl : window.location.href;
    let url = normalizeEndecaPathDuplication(new URL(baseHref));

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

    // ---- Parseo de dtoDescuentos ----
    let dtoArr = [];
    try { dtoArr = JSON.parse(get("product.dtoDescuentos") || "[]"); } catch { /* ignorar */ }

    // ---- Cálculo de descuento para precio unitario ajustado ----
    // La API provee en cada entrada de dtoDescuentos el campo `precioDescuento`
    // que ya representa el precio efectivo por unidad al tomar el deal
    // (ej: "70% 2da" con activePrice=$1900 → precioDescuento="$1235.00c/u",
    //  que es el promedio de pagar $1900 + $570 para 2 unidades).
    // Calculamos discountRatio = mejorPrecioEfectivo / activePrice y lo
    // aplicamos sobre referencePrice para obtener el precio por L/kg correcto.
    let discountRatio = 1;

    if (dtoArr.length > 0 && activePriceRaw > 0) {
      let bestEffectivePrice = Infinity;
      for (const dto of dtoArr) {
        // precioDescuento puede ser "$1235.00c/u", "$3900.00", "$2502.50", etc.
        // Extraer el primer número (formato US con punto decimal)
        const match = (dto.precioDescuento || "").match(/[\d]+(?:\.\d+)?/);
        const pd = match ? parseFloat(match[0]) : NaN;
        if (!isNaN(pd) && pd > 0 && pd < bestEffectivePrice) {
          bestEffectivePrice = pd;
        }
      }
      if (bestEffectivePrice < Infinity && bestEffectivePrice < activePriceRaw) {
        discountRatio = bestEffectivePrice / activePriceRaw;
        debugLog(
          `[discount] ${name}: bestPrecioDescuento=${bestEffectivePrice} / active=${activePriceRaw}` +
          ` → ratio=${discountRatio.toFixed(4)}`
        );
      }
    }

    // Fallback: sku.listPrice vs activePrice (por si acaso)
    if (discountRatio === 1) {
      const listPriceRaw = parseFloat(get("sku.listPrice") || "0");
      if (listPriceRaw > 0 && activePriceRaw > 0 && activePriceRaw < listPriceRaw) {
        discountRatio = activePriceRaw / listPriceRaw;
        debugLog(`[discount] ${name}: listPrice fallback=${listPriceRaw} → ratio=${discountRatio.toFixed(4)}`);
      }
    }

    // Precio de referencia ajustado por descuento
    const adjustedReferencePrice = (refPriceRaw > 0 && discountRatio < 0.999)
      ? refPriceRaw * discountRatio
      : refPriceRaw;

    // Texto de precio unitario corto: "$/L", "$/kg", etc.
    let unitPriceText = null;
    if (refPriceRaw > 0 && unitType) {
      const shortLabel = unitLabel(unitType);   // "L", "kg", "100g", "m²", "u"
      const priceToShow = discountRatio < 0.999 ? adjustedReferencePrice : refPriceRaw;
      unitPriceText = `$/${shortLabel}: ${formatApiPrice(priceToShow)}`;
    }

    // Precio efectivo con el mejor deal aplicado (para mostrar en revista)
    const discountedPriceText = (discountRatio < 0.999)
      ? formatApiPrice(activePriceRaw * discountRatio)
      : null;

    // Badges: solo los deals reales de dtoDescuentos (textoLlevando / textoDescuento).
    // Se omite tipoOferta porque contiene frases genéricas como "Hasta X% DTO!!"
    // que ya quedan implícitas en el precio ajustado.
    const badges = [];
    for (const dto of dtoArr) {
      if (dto.textoLlevando?.trim()) badges.push(dto.textoLlevando.trim());
      if (dto.textoDescuento?.trim() && !badges.includes(dto.textoDescuento.trim())) {
        badges.push(dto.textoDescuento.trim());
      }
    }

    debugLog(
      `Parsed: ${name} | price=${priceText} | unit=${unitPriceText} | ` +
      `type=${unitType} | ratio=${discountRatio.toFixed(4)}`
    );

    return {
      name, href, imgSrc, priceText, discountedPriceText, badges, unitPriceText, unitType,
      activePrice: activePriceRaw,
      referencePrice: refPriceRaw,
      adjustedReferencePrice,
      discountRatio,
    };
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
