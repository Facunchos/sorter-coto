// productService.js — normalize product records from API or DOM and provide helpers
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.productService = (function () {
  "use strict";

  const { formatPrice } = window.CotoSorter.utils || { formatPrice: (v) => String(v) };
  const { resolveBrand } = window.CotoSorter.promoUtils || { resolveBrand: () => null };

  function toNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function getLocalDateKey(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function formatCheckedAt(timestamp) {
    const checkedAtValue = Number(timestamp);
    if (!Number.isFinite(checkedAtValue) || checkedAtValue <= 0) {
      return { label: "Verificación Pending", isToday: false };
    }

    const date = new Date(checkedAtValue);
    if (Number.isNaN(date.getTime())) {
      return { label: "Verificación Pending", isToday: false };
    }

    const label = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(date);

    const isToday = getLocalDateKey(date) === getLocalDateKey(Date.now());
    return { label, isToday };
  }

  function buildFavoritePriceContext(item) {
    const formatPrice = window.CotoSorter?.utils?.formatPrice || ((value) => String(value));
    const parseMoneyLoose = window.CotoSorter?.priceUtils?.parseMoneyLoose || ((value) => Number(value));

    const listPrice = Number.isFinite(Number(item?.productListPrice))
      ? Number(item.productListPrice)
      : Number.isFinite(Number(item?.product_list_price))
      ? Number(item.product_list_price)
      : Number.isFinite(Number(item?.lastSeenRegularPrice))
      ? Number(item.lastSeenRegularPrice)
      : Number.isFinite(parseMoneyLoose(item?.priceText))
      ? parseMoneyLoose(item.priceText)
      : null;

    const referencePrice = Number.isFinite(Number(item?.referencePrice))
      ? Number(item.referencePrice)
      : listPrice;

    const displayedPrice = Number.isFinite(Number(item?.promoPriceRaw))
      ? Number(item.promoPriceRaw)
      : Number.isFinite(Number(item?.activePrice))
      ? Number(item.activePrice)
      : Number.isFinite(Number(item?.lastSeenDisplayedPrice))
      ? Number(item.lastSeenDisplayedPrice)
      : Number.isFinite(parseMoneyLoose(item?.discountedPriceText))
      ? parseMoneyLoose(item.discountedPriceText)
      : null;

    const discountRatio = Number.isFinite(Number(item?.discountRatio))
      ? Number(item.discountRatio)
      : Number.isFinite(Number(item?.lastSeenDiscountRatio))
      ? Number(item.lastSeenDiscountRatio)
      : (Number.isFinite(referencePrice) && Number.isFinite(displayedPrice) && referencePrice > 0
        ? displayedPrice / referencePrice
        : 1);

    const activePrice = Number.isFinite(Number(item?.activePrice))
      ? Number(item.activePrice)
      : Number.isFinite(Number(item?.lastSeenAdjustedUnitPrice))
      ? Number(item.lastSeenAdjustedUnitPrice)
      : displayedPrice ?? referencePrice;

    const unitPriceText = item?.unitPriceText != null ? String(item.unitPriceText) : null;
    const unitType = item?.unitType ? String(item.unitType) : null;
    const maxFormatPriceRaw = Number.isFinite(Number(item?.maxFormatPriceRaw))
      ? Number(item.maxFormatPriceRaw)
      : Number.isFinite(Number(item?.lastSeenAdjustedUnitPrice))
      ? Number(item.lastSeenAdjustedUnitPrice)
      : null;

    return {
      priceText: item?.priceText != null ? String(item.priceText) : (Number.isFinite(referencePrice) ? formatPrice(referencePrice) : null),
      discountedPriceText: item?.discountedPriceText != null ? String(item.discountedPriceText) : (discountRatio < 0.999 && Number.isFinite(displayedPrice) ? formatPrice(displayedPrice) : null),
      activePrice,
      referencePrice: Number.isFinite(referencePrice) ? referencePrice : null,
      productListPrice: Number.isFinite(listPrice) ? listPrice : null,
      adjustedReferencePrice: Number.isFinite(Number(item?.adjustedReferencePrice))
        ? Number(item.adjustedReferencePrice)
        : Number.isFinite(Number(item?.lastSeenAdjustedUnitPrice))
        ? Number(item.lastSeenAdjustedUnitPrice)
        : null,
      discountRatio,
      promoPriceRaw: Number.isFinite(displayedPrice) ? displayedPrice : null,
      promoTags: Array.isArray(item?.promoTags) ? item.promoTags.slice() : [],
      unitPriceText,
      unitType,
      badges: Array.isArray(item?.badges) ? item.badges.slice() : [],
      maxFormatPriceRaw,
    };
  }

  function canonicalizeProduct(data) {
    if (!data || typeof data !== "object") return null;

    const rawHref = data.href || data.url || null;
    let safeHref = null;
    if (rawHref) {
      try {
        safeHref = new URL(String(rawHref), window.location.origin).toString();
      } catch {
        safeHref = String(rawHref);
      }
    }

    const normalized = {
      name: data.name || data.title || data.productName || null,
      brand: data.brand || data.productBrand || data.brandName || null,
      productBrand: data.productBrand || data.brand || data.brandName || null,
      product_brand: data.product_brand || data.brand || data.brandName || null,
      href: safeHref || null,
      imgSrc: data.imgSrc || data.image || null,
      priceText: data.priceText != null ? String(data.priceText) : null,
      discountedPriceText: data.discountedPriceText != null ? String(data.discountedPriceText) : null,
      activePrice: toNumber(data.activePrice),
      referencePrice: toNumber(data.referencePrice),
      productListPrice: toNumber(data.productListPrice ?? data.product_list_price),
      priceWithoutTax: toNumber(data.priceWithoutTax),
      adjustedReferencePrice: toNumber(data.adjustedReferencePrice),
      discountRatio: Number.isFinite(Number(data.discountRatio)) ? Number(data.discountRatio) : 1,
      promoPriceRaw: toNumber(data.promoPriceRaw),
      promoTags: Array.isArray(data.promoTags) ? data.promoTags.map((item) => String(item)) : [],
      unitPriceText: data.unitPriceText != null ? String(data.unitPriceText) : null,
      unitType: data.unitType ? String(data.unitType) : null,
      badges: Array.isArray(data.badges) ? data.badges.slice() : [],
      maxFormatPriceRaw: toNumber(data.maxFormatPriceRaw),
      raw: data.raw || data,
    };

    return normalized;
  }

  function extractCurrentPageProductFromDocument(doc) {
    const page = doc || document;
    const root = page.querySelector("[data-cnstrc-product-detail], app-product-detail, .promociones-medios-pago");
    if (!root) return null;

    const formatPrice = window.CotoSorter?.utils?.formatPrice || ((value) => String(value));
    const parseMoneyLoose = window.CotoSorter?.priceUtils?.parseMoneyLoose || ((value) => Number(value));

    const nameEl = root.querySelector("h2.title, [data-cnstrc-item-name], .title");
    const hrefEl = root.querySelector("a[href]");
    const imgEl = root.querySelector("img");
    const priceAttr = Number.isFinite(Number(root.getAttribute("data-cnstrc-item-price")))
      ? Number(root.getAttribute("data-cnstrc-item-price"))
      : null;

    const displayedPriceEl = root.querySelector("var.price, .price.h3, h4.card-title, .card-title");
    const displayedPrice = parseMoneyLoose(displayedPriceEl?.textContent || displayedPriceEl?.innerText || "");

    let regularPrice = NaN;
    for (const small of Array.from(root.querySelectorAll("small, div, span"))) {
      const text = small.textContent || small.innerText || "";
      const regMatch = text.match(/Precio\s+regular\s*:\s*\$([\d\.,]+)/i);
      if (regMatch) {
        regularPrice = parseMoneyLoose(regMatch[1]);
        break;
      }
    }

    if (!Number.isFinite(regularPrice) || regularPrice <= 0) {
      regularPrice = Number.isFinite(priceAttr) && priceAttr > 0 ? priceAttr : NaN;
    }

    const activePrice = Number.isFinite(displayedPrice) && displayedPrice > 0
      ? displayedPrice
      : (Number.isFinite(priceAttr) && priceAttr > 0 ? priceAttr : (Number.isFinite(regularPrice) ? regularPrice : null));
    const referencePrice = Number.isFinite(regularPrice) && regularPrice > 0
      ? regularPrice
      : (Number.isFinite(priceAttr) && priceAttr > 0 ? priceAttr : activePrice);
    const hasDiscount = Number.isFinite(activePrice) && Number.isFinite(referencePrice) && activePrice > 0 && referencePrice > 0 && activePrice < referencePrice;

    const name = String(nameEl?.textContent || nameEl?.innerText || root.getAttribute("data-cnstrc-item-name") || "").trim();
    const href = String(hrefEl?.href || window.location.href || "").trim() || null;
    const imgSrc = String(imgEl?.src || "").trim() || null;

    if (!name) return null;

    return canonicalizeProduct({
      name,
      brand: resolveBrand({ name }),
      href,
      imgSrc,
      priceText: Number.isFinite(referencePrice) ? formatPrice(referencePrice) : null,
      discountedPriceText: hasDiscount && Number.isFinite(activePrice) ? formatPrice(activePrice) : null,
      activePrice,
      referencePrice,
      productListPrice: Number.isFinite(priceAttr) ? priceAttr : null,
      priceWithoutTax: null,
      adjustedReferencePrice: Number.isFinite(referencePrice) ? referencePrice : activePrice,
      discountRatio: hasDiscount && Number.isFinite(activePrice) && Number.isFinite(referencePrice) && referencePrice > 0
        ? (activePrice / referencePrice)
        : 1,
      promoPriceRaw: hasDiscount ? activePrice : null,
      promoTags: hasDiscount ? ["Favorito verificado"] : [],
      unitPriceText: null,
      unitType: null,
      badges: [],
      maxFormatPriceRaw: null,
      raw: { source: "single-page-detail" },
    });
  }

  function buildFavoriteSnapshot(product, overrides = {}) {
    const normalized = canonicalizeProduct(product);
    if (!normalized) return null;
    const priceContext = buildFavoritePriceContext({ ...normalized, ...overrides });

    return {
      name: overrides.name || normalized.name || overrides.searchTerm || null,
      searchTerm: overrides.searchTerm || normalized.name || normalized.productBrand || normalized.brand || null,
      writtenText: overrides.writtenText != null ? String(overrides.writtenText) : (overrides.searchTerm || normalized.name || ""),
      brand: overrides.brand || normalized.brand || normalized.productBrand || null,
      productBrand: normalized.productBrand || normalized.brand || null,
      product_brand: normalized.product_brand || normalized.brand || null,
      href: normalized.href,
      imgSrc: normalized.imgSrc,
      priceText: priceContext.priceText,
      discountedPriceText: priceContext.discountedPriceText,
      activePrice: priceContext.activePrice,
      referencePrice: priceContext.referencePrice,
      adjustedReferencePrice: priceContext.adjustedReferencePrice,
      discountRatio: priceContext.discountRatio,
      promoPriceRaw: priceContext.promoPriceRaw,
      promoTags: priceContext.promoTags.slice(),
      unitPriceText: priceContext.unitPriceText,
      unitType: priceContext.unitType,
      badges: priceContext.badges.slice(),
      lastCheckedAt: Number.isFinite(Number(overrides.lastCheckedAt)) ? Number(overrides.lastCheckedAt) : Date.now(),
      lastSeenDisplayedPrice: toNumber(overrides.lastSeenDisplayedPrice) ?? priceContext.activePrice,
      lastSeenRegularPrice: toNumber(overrides.lastSeenRegularPrice) ?? priceContext.referencePrice,
      lastSeenAdjustedUnitPrice: toNumber(overrides.lastSeenAdjustedUnitPrice) ?? priceContext.adjustedReferencePrice,
      lastSeenDiscountRatio: Number.isFinite(Number(overrides.lastSeenDiscountRatio)) ? Number(overrides.lastSeenDiscountRatio) : priceContext.discountRatio,
      maxFormatPriceRaw: priceContext.maxFormatPriceRaw,
      productListPrice: priceContext.productListPrice,
      priceWithoutTax: normalized.priceWithoutTax,
    };
  }

  function buildFavoritePriceMeta(item) {
    const formatPrice = window.CotoSorter?.utils?.formatPrice || ((value) => String(value));
    const priceContext = buildFavoritePriceContext(item);
    const priceUtils = window.CotoSorter?.priceUtils;
    const resolved = priceUtils && typeof priceUtils.resolveDisplayPrices === "function"
      ? priceUtils.resolveDisplayPrices(priceContext)
      : null;

    const regularPrice = Number.isFinite(priceContext.referencePrice) ? priceContext.referencePrice : null;
    const discountedPrice = Number.isFinite(priceContext.promoPriceRaw) ? priceContext.promoPriceRaw : null;
    const discountRatio = Number.isFinite(priceContext.discountRatio) ? priceContext.discountRatio : null;
    const actualPrice = Number.isFinite(priceContext.activePrice) ? priceContext.activePrice : null;
    const displayPriceText = resolved?.promoPriceText || resolved?.regularPriceText || (actualPrice !== null ? formatPrice(actualPrice) : "Verificación Pending");
    const displayPriceClass = resolved?.hasDiscount ? "price-discount" : "price-regular";

    const checkedAtInfo = formatCheckedAt(item?.lastCheckedAt);
    const checkedAt = checkedAtInfo.label;
    const isSameDay = checkedAtInfo.isToday;

    const hasSnapshot = !!checkedAt || regularPrice !== null || discountedPrice !== null || actualPrice !== null;
    const hasDiscount = resolved ? !!resolved.hasDiscount : (Number.isFinite(discountRatio) && discountRatio > 0 && discountRatio < 0.999);
    const discountPct = hasDiscount ? Math.max(1, Math.round((1 - discountRatio) * 100)) : 0;
    const lastPriceValue = hasDiscount
      ? (discountedPrice ?? actualPrice ?? regularPrice)
      : (actualPrice ?? regularPrice ?? discountedPrice);
    const todayPriceValue = actualPrice;
    const lastPriceState = hasDiscount ? "price-discount" : "price-regular";
    const todayPriceState = Number.isFinite(Number(item?.discountRatio)) && Number(item.discountRatio) < 0.999
      ? "price-discount"
      : "price-regular";
    const currentPriceText = displayPriceText;
    const currentPriceClass = displayPriceClass;
    const hoverStatusText = isSameDay ? currentPriceText : "Update pending";
    const hoverStatusClass = isSameDay ? currentPriceClass : "price-pending";

    const tooltipLines = {
      checkedAt: checkedAt || "Verificación Pending",
      regularPrice: resolved?.regularPriceText || (regularPrice !== null ? formatPrice(regularPrice) : "Verificación Pending"),
      discountText: hasDiscount ? `-${discountPct}%` : "Sin descuento",
      discountedPrice: resolved?.promoPriceText || (discountedPrice !== null ? formatPrice(discountedPrice) : "Verificación Pending"),
      actualPrice: displayPriceText,
    };

    return {
      hasSnapshot,
      hasDiscount,
      discountPct,
      checkedAt,
      isSameDay,
      regularPrice,
      discountedPrice,
      actualPrice,
      displayPriceText,
      displayPriceClass,
      lastPriceValue,
      todayPriceValue,
      lastPriceState,
      todayPriceState,
      currentPriceText,
      currentPriceClass,
      hoverStatusText,
      hoverStatusClass,
      tooltipLines,
      visibleLabel: "Precio",
    };
  }

  async function tryApiScrape(url) {
    const api = window.CotoSorter?.api;
    const { debugLog } = window.CotoSorter?.logger || { debugLog: () => {} };
    if (!api || typeof api.scrapeProductsFromPageUrl !== "function") {
      debugLog("productService: api scraper unavailable, skipping API path", url);
      return [];
    }

    const attempts = 2;
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      try {
        debugLog(`productService: api scrape attempt ${i + 1}/${attempts}`, url);
        const products = await api.scrapeProductsFromPageUrl(url);
        debugLog(`productService: api scrape succeeded with ${Array.isArray(products) ? products.length : 0} products`, url);
        return Array.isArray(products) ? products.map(normalizeApiRecord) : [];
      } catch (err) {
        lastErr = err;
        const wait = 200 * Math.pow(2, i) + Math.floor(Math.random() * 100);
        debugLog(`productService: api scrape attempt ${i + 1} failed: ${err?.message || err}; retrying in ${wait}ms`);
        if (i < attempts - 1) await new Promise((res) => setTimeout(res, wait));
      }
    }

    debugLog("productService: api scrape failed ultimately", lastErr?.message || lastErr);
    return [];
  }

  function normalizeApiRecord(rec) {
    return canonicalizeProduct(rec);
  }

  function normalizeProductFromDomElement(productEl) {
    if (!productEl) return null;

    const badgeData = window.CotoSorter?.badges?.extractProductData
      ? window.CotoSorter.badges.extractProductData(productEl)
      : null;

    if (!badgeData) return null;

    const nameEl = productEl.querySelector(".nombre-producto, h3, h4.card-title, .card-title");
    const hrefEl = productEl.querySelector("a[href]");

    const imgEl = productEl.querySelector("img");

    return canonicalizeProduct({
      name: String(nameEl?.textContent || nameEl?.innerText || "").trim() || badgeData.name || null,
      brand: badgeData.brand || null,
      href: String(hrefEl?.href || "") || badgeData.href || null,
      imgSrc: String(imgEl?.src || "") || badgeData.imgSrc || null,
      priceText: badgeData.displayedPrice ? formatPrice(badgeData.displayedPrice) : null,
      discountedPriceText: badgeData.discountRatio < 0.999 && badgeData.displayedPrice ? formatPrice(badgeData.displayedPrice) : null,
      activePrice: badgeData.displayedPrice,
      referencePrice: badgeData.regularPrice,
      adjustedReferencePrice: badgeData.adjustedUnitPrice,
      discountRatio: badgeData.discountRatio,
      promoPriceRaw: badgeData.displayedPrice,
      promoTags: badgeData.discountRatio < 0.999 ? ["Favorito verificado"] : [],
      unitPriceText: badgeData.unitRawLabel ? `$/` + badgeData.unitRawLabel + `: ${formatPrice(badgeData.listedUnitPrice)}` : null,
      unitType: badgeData.unitType || null,
      badges: [],
      raw: badgeData,
    });
  }

  async function tryDomParse(url) {
    try {
      const { debugLog } = window.CotoSorter?.logger || { debugLog: () => {} };
      debugLog("productService: falling back to DOM scrape", url);
      const html = await window.CotoSorter?.api?.fetchTextWithRetry
        ? await window.CotoSorter.api.fetchTextWithRetry(url, { credentials: "same-origin" })
        : await fetch(url, { credentials: "same-origin" }).then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)));
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Parse all product cards from the fetched page, not just the first one.
      const elements = Array.from(doc.querySelectorAll(".producto-card, .card-container, [data-cnstrc-item-price]"));
      const unique = [];
      const seen = new Set();

      for (const el of elements) {
        const card = el.closest(".producto-card, .card-container") || el;
        if (!card || seen.has(card)) continue;
        seen.add(card);
        const product = normalizeProductFromDomElement(card);
        if (product) unique.push(product);
      }

      debugLog(`productService: DOM scrape succeeded with ${unique.length} products`, url);
      return unique;
    } catch (err) {
      const { debugLog } = window.CotoSorter?.logger || { debugLog: () => {} };
      debugLog("productService: dom parse failed", err?.message || err);
      return [];
    }
  }

  async function extractProductsFromPageUrl(url) {
    const { debugLog } = window.CotoSorter?.logger || { debugLog: () => {} };
    const isCurrentPage = String(url || "") === String(window.location.href || "");

    const apiResults = await tryApiScrape(url);
    if (apiResults && apiResults.length > 0) {
      debugLog("productService: page extraction resolved via API", {
        url,
        count: apiResults.length,
      });
      return apiResults.filter(Boolean);
    }

    if (isCurrentPage) {
      const currentPageProduct = extractCurrentPageProductFromDocument(document);
      debugLog("productService: current-page product extraction", {
        url,
        matched: !!currentPageProduct,
        name: currentPageProduct?.name || null,
        href: currentPageProduct?.href || null,
      });
      if (currentPageProduct) return [currentPageProduct];
    }

    const domResults = await tryDomParse(url);
    debugLog("productService: page extraction resolved via DOM", {
      url,
      count: Array.isArray(domResults) ? domResults.length : 0,
    });
    return domResults.filter(Boolean);
  }

  function normalizeForMatch(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function pickMatchingProduct(favorite, products) {
    const favoriteName = normalizeForMatch(favorite?.name || favorite?.searchTerm);
    const favoriteBrand = normalizeForMatch(favorite?.brand);

    const exact = (products || []).find((product) => normalizeForMatch(product?.name) === favoriteName);
    if (exact) return exact;

    const brandMatch = (products || []).find((product) => {
      const productName = normalizeForMatch(product?.name);
      const productBrand = normalizeForMatch(product?.brand || product?.productBrand || product?.brandName);
      return productName === favoriteName && (!favoriteBrand || productBrand === favoriteBrand);
    });
    if (brandMatch) return brandMatch;

    return (products || []).find((product) => normalizeForMatch(product?.name).includes(favoriteName)) || null;
  }

  async function resolveFavoriteProductFromPageUrl(url, favorite) {
    const { debugLog } = window.CotoSorter?.logger || { debugLog: () => {} };
    const products = await extractProductsFromPageUrl(url);
    if (!Array.isArray(products) || products.length === 0) {
      debugLog("productService: resolveFavoriteProductFromPageUrl found no products", {
        url,
        favoriteId: favorite?.id || null,
        favoriteName: favorite?.name || favorite?.searchTerm || null,
      });
      return null;
    }

    const targetId = String(favorite?.id || "").trim();
    const targetHref = String(favorite?.href || "").trim();
    const targetName = String(favorite?.name || favorite?.searchTerm || "").trim();

    const directMatch = products.find((product) => {
      if (!product) return false;
      if (targetId && String(product.id || "") === targetId) return true;
      if (targetHref && String(product.href || "") === targetHref) return true;
      if (targetName && String(product.name || product.sku_display_name || "").trim() === targetName) return true;
      return false;
    }) || null;

    const resolved = directMatch || pickMatchingProduct(favorite, products);
    debugLog("productService: resolveFavoriteProductFromPageUrl result", {
      url,
      favoriteId: favorite?.id || null,
      favoriteName: favorite?.name || favorite?.searchTerm || null,
      productsCount: products.length,
      matched: !!resolved,
      matchedName: resolved?.name || null,
      matchedHref: resolved?.href || null,
    });
    return resolved;
  }

  return {
    canonicalizeProduct,
    buildFavoriteSnapshot,
    buildFavoritePriceMeta,
    formatCheckedAt,
    extractProductsFromPageUrl,
    resolveFavoriteProductFromPageUrl,
    normalizeProductFromDomElement,
    normalizeApiRecord,
  };
})();
