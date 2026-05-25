// productService.js — normalize product records from API or DOM and provide helpers
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.productService = (function () {
  "use strict";

  const { formatPrice } = window.CotoSorter.utils || { formatPrice: (v) => String(v) };

  function toNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function buildFavoritePriceContext(item) {
    const formatPrice = window.CotoSorter?.utils?.formatPrice || ((value) => String(value));
    const parseMoneyLoose = window.CotoSorter?.priceUtils?.parseMoneyLoose || ((value) => Number(value));

    const referencePrice = Number.isFinite(Number(item?.referencePrice))
      ? Number(item.referencePrice)
      : Number.isFinite(Number(item?.lastSeenRegularPrice))
      ? Number(item.lastSeenRegularPrice)
      : Number.isFinite(parseMoneyLoose(item?.priceText))
      ? parseMoneyLoose(item.priceText)
      : null;

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

    const normalized = {
      name: data.name || data.title || data.productName || null,
      brand: data.brand || data.productBrand || data.brandName || null,
      productBrand: data.productBrand || data.brand || data.brandName || null,
      product_brand: data.product_brand || data.brand || data.brandName || null,
      href: data.href || data.url || null,
      imgSrc: data.imgSrc || data.image || null,
      priceText: data.priceText != null ? String(data.priceText) : null,
      discountedPriceText: data.discountedPriceText != null ? String(data.discountedPriceText) : null,
      activePrice: toNumber(data.activePrice),
      referencePrice: toNumber(data.referencePrice),
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

    const checkedAtValue = Number(item?.lastCheckedAt);
    const checkedAt = Number.isFinite(checkedAtValue) && checkedAtValue > 0
      ? new Intl.DateTimeFormat("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }).format(new Date(checkedAtValue))
      : null;

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

    const tooltipLines = {
      checkedAt: checkedAt || "Verificación Pending",
      regularPrice: regularPrice !== null ? formatPrice(regularPrice) : "Verificación Pending",
      discountText: hasDiscount ? `-${discountPct}%` : "Sin descuento",
      discountedPrice: discountedPrice !== null ? formatPrice(discountedPrice) : "Verificación Pending",
      actualPrice: actualPrice !== null ? formatPrice(actualPrice) : "Verificación Pending",
    };

    return {
      hasSnapshot,
      hasDiscount,
      discountPct,
      checkedAt,
      regularPrice,
      discountedPrice,
      actualPrice,
      lastPriceValue,
      todayPriceValue,
      lastPriceState,
      todayPriceState,
      tooltipLines,
      visibleLabel: "Precio",
    };
  }

  async function tryApiScrape(url) {
    try {
      const api = window.CotoSorter?.api;
      if (api && typeof api.scrapeProductsFromPageUrl === "function") {
        const products = await api.scrapeProductsFromPageUrl(url);
        return Array.isArray(products) ? products.map(normalizeApiRecord) : [];
      }
    } catch (err) {
      console.debug("productService: api scrape failed", err?.message || err);
    }
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
      const resp = await fetch(url, { credentials: "same-origin" });
      if (!resp || resp.status !== 200) return [];
      const html = await resp.text();
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

      return unique;
    } catch (err) {
      console.debug("productService: dom parse failed", err?.message || err);
      return [];
    }
  }

  async function extractProductsFromPageUrl(url) {
    const apiResults = await tryApiScrape(url);
    if (apiResults && apiResults.length > 0) return apiResults.filter(Boolean);
    const domResults = await tryDomParse(url);
    return domResults.filter(Boolean);
  }

  return {
    canonicalizeProduct,
    buildFavoriteSnapshot,
    buildFavoritePriceMeta,
    extractProductsFromPageUrl,
    normalizeProductFromDomElement,
    normalizeApiRecord,
  };
})();
