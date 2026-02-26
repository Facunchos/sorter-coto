// api.js — Captura de URL Endeca y scraping de productos via API JSON
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.api = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;
  const { cFormatoToUnitType, formatApiPrice, unitLabel } = window.CotoSorter.utils;

  const ENDeca_BATCH = 50;
  const ENDeca_PARALLEL = 3;
  const BFF_PARALLEL = 6;

  let capturedEndecaUrl = null;
  let capturedBffUrl = null;

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

  /** Determina si una URL corresponde al endpoint BFF de productos/ofertas. */
  function isBffProductsUrl(rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (!/api\.coto\.com\.ar$/i.test(u.hostname)) return false;
      if (!/\/api\/v1\/products\//i.test(u.pathname)) return false;
      return u.searchParams.has("num_results_per_page") || u.searchParams.has("page");
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

  /** Busca la última URL BFF de productos en PerformanceResourceTiming. */
  function findBffUrlInPerformance() {
    try {
      const entries = performance.getEntriesByType("resource");
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (
          (entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch") &&
          isBffProductsUrl(entry.name)
        ) {
          return entry.name;
        }
      }
    } catch { /* ignorar */ }
    return null;
  }

  /** Espera unos ms para detectar URL BFF en Performance (evita carrera al generar muy rápido). */
  async function waitForBffUrlInPerformance(timeoutMs = 2500, stepMs = 80) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      refreshCapturedUrls();
      const candidate = capturedBffUrl || findBffUrlInPerformance();
      if (candidate) return candidate;
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
    return null;
  }

  /** Refresca URLs capturadas con las últimas entradas de Performance. */
  function refreshCapturedUrls() {
    const latestEndeca = findEndecaUrlInPerformance();
    if (latestEndeca) {
      capturedEndecaUrl = latestEndeca;
    }

    const latestBff = findBffUrlInPerformance();
    if (latestBff) {
      capturedBffUrl = latestBff;
    }
  }

  /** Configura captura pasiva de URL Endeca via PerformanceObserver. */
  function setupApiUrlCapture() {
    refreshCapturedUrls();

    if (typeof PerformanceObserver === "undefined") return;

    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const isXHR = entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch";
        if (!isXHR) continue;

        if (isEndecaUrl(entry.name)) {
          capturedEndecaUrl = entry.name;
          debugLog("[ApiCapture] Updated Endeca URL via PerformanceObserver:", capturedEndecaUrl);
        }

        if (isBffProductsUrl(entry.name)) {
          capturedBffUrl = entry.name;
          debugLog("[ApiCapture] Updated BFF URL via PerformanceObserver:", capturedBffUrl);
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
  function buildEndecaApiUrl(offset, nrpp) {
    refreshCapturedUrls();

    const useCapture = capturedEndecaUrl && capturedUrlMatchesCurrentPage(capturedEndecaUrl);
    if (!useCapture && capturedEndecaUrl) {
      debugLog("[ApiCapture] Captured URL doesn't match current page, falling back to location.href");
    }

    const baseHref = useCapture ? capturedEndecaUrl : window.location.href;
    let url = normalizeEndecaPathDuplication(new URL(baseHref));
    url = decodePathEncodedParams(url);

    url.searchParams.set("format", "json");
    url.searchParams.set("No", String(offset));
    url.searchParams.set("Nrpp", String(nrpp));
    url.searchParams.delete("_dyncharset");
    return url.toString();
  }

  /** Construye URL paginada BFF manteniendo template capturado. */
  function buildBffPageUrl(baseUrl, page, nrpp) {
    const u = new URL(baseUrl);
    u.searchParams.set("num_results_per_page", String(nrpp));
    u.searchParams.set("page", String(page));
    return u.toString();
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

  /** Verifica que la respuesta tenga forma BFF válida. */
  function isValidBffResponse(data) {
    return Array.isArray(data?.response?.results);
  }

  /** Convierte valor a número positivo (o 0). */
  function numOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Convierte precio sin IVA a precio final aproximado con IVA. */
  function fromWithoutTax(priceWithoutTax) {
    const raw = numOrZero(priceWithoutTax);
    if (!raw) return 0;
    return raw * 1.21;
  }

  /** Extrae badges legibles de sale_type y discounts. */
  function parseBffBadges(data) {
    const badges = [];

    const saleTypes = Array.isArray(data?.sale_type) ? data.sale_type : [];
    for (const sale of saleTypes) {
      const s = String(sale || "").trim();
      if (!s || /^todas\s+las\s+ofertas$/i.test(s)) continue;
      if (!badges.includes(s)) badges.push(s);
    }

    const discounts = Array.isArray(data?.discounts) ? data.discounts : [];
    for (const dto of discounts) {
      const candidates = [dto?.textoLlevando, dto?.textoDescuento, dto?.name, dto?.label];
      for (const c of candidates) {
        const text = String(c || "").trim();
        if (text && !badges.includes(text)) badges.push(text);
      }
    }

    return badges;
  }

  /** Parsea registro BFF al formato interno de producto. */
  function parseBffRecord(result) {
    const data = result?.data || {};

    const name = data.sku_display_name || data.sku_description || result?.value || "Producto";

    const rawPath = String(data.url || "").trim();
    const href = rawPath
      ? (/^https?:\/\//i.test(rawPath)
          ? rawPath
          : "https://www.cotodigital.com.ar/sitios/cdigi/productos/" + rawPath.replace(/^\//, ""))
      : null;

    const imgSrc = data.product_large_image_url || data.product_medium_image_url || data.image_url || null;
    const unitType = cFormatoToUnitType(data.product_format || "");

    const listPrice = numOrZero(data.product_list_price);
    const priceEntries = Array.isArray(data.price) ? data.price : [];
    const priceCandidates = priceEntries
      .map((p) => fromWithoutTax(p?.priceWithoutTax))
      .filter((n) => n > 0);

    const maxPrice = priceCandidates.length ? Math.max(...priceCandidates) : 0;
    const minPrice = priceCandidates.length ? Math.min(...priceCandidates) : 0;

    const activePrice = listPrice || maxPrice || minPrice || 0;
    const referencePrice = activePrice;

    let discountRatio = 1;
    if (minPrice > 0 && activePrice > 0 && minPrice < activePrice) {
      discountRatio = minPrice / activePrice;
    }

    const hasDiscount = discountRatio < 0.999;
    const adjustedReferencePrice = hasDiscount ? referencePrice * discountRatio : referencePrice;
    const discountedPriceText = hasDiscount ? formatApiPrice(activePrice * discountRatio) : null;

    const priceText = formatApiPrice(activePrice);

    let unitPriceText = null;
    if (referencePrice > 0 && unitType) {
      const shortLabel = unitLabel(unitType);
      const priceToShow = hasDiscount ? adjustedReferencePrice : referencePrice;
      unitPriceText = `$/${shortLabel}: ${formatApiPrice(priceToShow)}`;
    }

    const badges = parseBffBadges(data);


    return {
      name,
      href,
      imgSrc,
      priceText,
      discountedPriceText,
      badges,
      unitPriceText,
      unitType,
      activePrice,
      referencePrice,
      adjustedReferencePrice,
      discountRatio,
    };
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
  function calcDiscountRatio(dtoArr, activePrice, get) {
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
      }
    }

    // Fallback: sku.listPrice vs activePrice
    if (discountRatio === 1) {
      const listPrice = parseFloat(get("sku.listPrice") || "0");
      if (listPrice > 0 && activePrice > 0 && activePrice < listPrice) {
        discountRatio = activePrice / listPrice;
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

    const discountRatio = calcDiscountRatio(dtoArr, activePrice, get);
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

  /** Extrae productos de una respuesta BFF (response.results). */
  function extractProductsFromBffResponse(data) {
    const products = [];
    const results = data?.response?.results || [];

    for (const result of results) {
      try { products.push(parseBffRecord(result)); }
      catch (e) { debugLog("Error parsing BFF record:", e); }
    }

    return products;
  }

  /** Scraping paginado usando Endeca legado. */
  async function scrapeViaEndeca(progressCallback) {
    debugLog("Fetching first batch from Endeca JSON API...");
    const firstUrl = buildEndecaApiUrl(0, ENDeca_BATCH);
    debugLog(`Endeca URL: ${firstUrl}`);

    const firstResp = await fetch(firstUrl, { credentials: "same-origin" });
    if (!firstResp.ok) throw new Error(`Endeca API error ${firstResp.status}`);

    const firstData = await firstResp.json();
    const resultsList = findResultsList(firstData);
    if (!resultsList) {
      throw new Error("Endeca response sin Category_ResultsList");
    }

    const totalNumRecs = resultsList.totalNumRecs || 0;
    if (progressCallback) progressCallback(0, totalNumRecs);

    const allProducts = extractProductsFromResultsList(resultsList);
    if (progressCallback) progressCallback(allProducts.length, totalNumRecs);

    const remainingOffsets = [];
    for (let offset = ENDeca_BATCH; offset < totalNumRecs; offset += ENDeca_BATCH) {
      remainingOffsets.push(offset);
    }

    for (let i = 0; i < remainingOffsets.length; i += ENDeca_PARALLEL) {
      const group = remainingOffsets.slice(i, i + ENDeca_PARALLEL);
      const results = await Promise.all(
        group.map(async (offset) => {
          const url = buildEndecaApiUrl(offset, ENDeca_BATCH);
          debugLog(`Fetching Endeca offset ${offset}: ${url}`);
          const resp = await fetch(url, { credentials: "same-origin" });
          if (!resp.ok) throw new Error(`Endeca API error ${resp.status} at offset ${offset}`);
          const data = await resp.json();
          return extractProductsFromResultsList(findResultsList(data));
        })
      );

      for (const batch of results) allProducts.push(...batch);
      if (progressCallback) progressCallback(allProducts.length, totalNumRecs);
    }

    debugLog(`Endeca scraping complete: ${allProducts.length}/${totalNumRecs}`);
    return allProducts;
  }

  /** Scraping paginado usando endpoint BFF auto-detectado. */
  async function scrapeViaBff(progressCallback) {
    refreshCapturedUrls();

    let baseUrl = capturedBffUrl || findBffUrlInPerformance();
    if (!baseUrl) {
      debugLog("BFF URL not available yet, waiting for Performance capture...");
      baseUrl = await waitForBffUrlInPerformance();
    }

    if (!baseUrl) {
      throw new Error(
        "No se detectó endpoint BFF de productos en Performance. " +
        "Esperá 1 segundo a que cargue resultados y volvé a intentar."
      );
    }

    const parsedBase = new URL(baseUrl);
    const nrpp = Math.max(1, parseInt(parsedBase.searchParams.get("num_results_per_page") || "24", 10));
    const firstUrl = buildBffPageUrl(baseUrl, 1, nrpp);

    debugLog(`BFF template detected: ${baseUrl}`);
    debugLog(`Fetching BFF page 1: ${firstUrl}`);

    const firstResp = await fetch(firstUrl, { credentials: "same-origin" });
    if (!firstResp.ok) throw new Error(`BFF API error ${firstResp.status}`);

    const firstData = await firstResp.json();
    if (!isValidBffResponse(firstData)) {
      throw new Error("BFF response inválida: falta response.results");
    }

    const totalNumRecs = Number(firstData?.response?.total_num_results) || firstData.response.results.length;
    const totalPages = Math.max(1, Math.ceil(totalNumRecs / nrpp));

    if (progressCallback) progressCallback(0, totalNumRecs);

    const allProducts = extractProductsFromBffResponse(firstData);
    if (progressCallback) progressCallback(allProducts.length, totalNumRecs);

    const pages = [];
    for (let page = 2; page <= totalPages; page++) pages.push(page);

    for (let i = 0; i < pages.length; i += BFF_PARALLEL) {
      const group = pages.slice(i, i + BFF_PARALLEL);
      const results = await Promise.all(
        group.map(async (page) => {
          const url = buildBffPageUrl(baseUrl, page, nrpp);
          debugLog(`Fetching BFF page ${page}: ${url}`);
          const resp = await fetch(url, { credentials: "same-origin" });
          if (!resp.ok) throw new Error(`BFF API error ${resp.status} at page ${page}`);
          const data = await resp.json();
          if (!isValidBffResponse(data)) {
            throw new Error(`BFF response inválida en page ${page}: falta response.results`);
          }
          return extractProductsFromBffResponse(data);
        })
      );

      for (const batch of results) allProducts.push(...batch);
      if (progressCallback) progressCallback(Math.min(allProducts.length, totalNumRecs), totalNumRecs);
    }

    debugLog(`BFF scraping complete: ${allProducts.length}/${totalNumRecs}`);
    return allProducts;
  }

  /**
   * Obtiene TODOS los productos usando estrategia endpoint-agnostic.
   * 1) Intenta Endeca legado.
   * 2) Si falla (o no hay Category_ResultsList), detecta XHR BFF y pagina por template.
   * @param {Function} progressCallback — (loaded, total) => void
   */
  async function scrapeAllPages(progressCallback) {
    try {
      return await scrapeViaEndeca(progressCallback);
    } catch (endecaErr) {
      debugLog("Endeca fallback triggered:", endecaErr?.message || endecaErr);
    }

    return scrapeViaBff(progressCallback);
  }

  return { setupApiUrlCapture, scrapeAllPages };
})();
