// badges.js — Extracción de datos de producto e inyección de badges
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.badges = (function () {
  "use strict";

  const { UNIT_PRICE_REGEX, UNIT_QTY_REGEX, BADGE_CLASS, BADGE_ATTR,
          parsePrice, formatPrice, normalizeUnitType, unitLabel } = window.CotoSorter.utils;
  const { debugLog } = window.CotoSorter.logger;

  /** Extrae datos de precio unitario ajustado de un elemento producto del DOM. */
  function extractProductData(productEl) {
    const smalls = productEl.querySelectorAll("small");
    let unitMatch = null;
    let qtyStr = "1";

    for (const small of smalls) {
      const text = small.textContent || small.innerText || "";
      const match = text.match(UNIT_PRICE_REGEX);
      if (match) {
        unitMatch = match;
        const qtyMatch = text.match(UNIT_QTY_REGEX);
        if (qtyMatch) qtyStr = qtyMatch[1];
        break;
      }
    }

    if (!unitMatch) return null;

    const rawUnitType = unitMatch[1];
    const rawUnitPrice = unitMatch[2];
    const type = normalizeUnitType(rawUnitType, qtyStr);
    if (!type) return null;

    const listedUnitPrice = parsePrice(rawUnitPrice);
    if (isNaN(listedUnitPrice) || listedUnitPrice <= 0) return null;

    // Precio mostrado (lo que pagás)
    const h4 = productEl.querySelector("h4.card-title");
    const displayedPrice = h4 ? parsePrice(h4.textContent) : NaN;

    // Precio regular — fuente primaria: data-cnstrc-item-price
    const cardContainer = productEl.querySelector("[data-cnstrc-item-price]");
    let regularPrice = NaN;

    if (cardContainer) {
      regularPrice = parseFloat(cardContainer.getAttribute("data-cnstrc-item-price"));
    }

    // Fallback: parsear "Precio Regular: $X" del texto
    if (isNaN(regularPrice) || regularPrice <= 0) {
      for (const small of smalls) {
        const text = small.textContent || "";
        const regMatch = text.match(/Precio\s+Regular\s*:\s*\$([\d\.,]+)/i);
        if (regMatch) {
          regularPrice = parsePrice(regMatch[1]);
          break;
        }
      }
    }

    if (isNaN(regularPrice) || regularPrice <= 0) {
      regularPrice = displayedPrice;
    }

    // Ratio de descuento
    let discountRatio = 1;
    if (!isNaN(displayedPrice) && displayedPrice > 0 && regularPrice > 0) {
      discountRatio = displayedPrice / regularPrice;
    }

    // Precio unitario ajustado
    const adjustedUnitPrice = listedUnitPrice * discountRatio;

    const nameEl = productEl.querySelector("h3.nombre-producto");
    const name = nameEl ? nameEl.textContent.trim() : "(unknown)";

    debugLog(
      `${name}: listed=$${listedUnitPrice.toFixed(2)}, ` +
      `displayed=$${displayedPrice}, regular=$${regularPrice}, ` +
      `ratio=${discountRatio.toFixed(4)}, adjusted=$${adjustedUnitPrice.toFixed(2)} /${unitLabel(type)}`
    );

    return {
      unitType: type,
      unitRawLabel: rawUnitType,
      listedUnitPrice,
      adjustedUnitPrice,
      displayedPrice,
      regularPrice,
      discountRatio,
      name,
    };
  }

  // ---- Badge Injection ----

  /** Inyecta o actualiza el badge de precio en un card wrapper. */
  function injectBadgeOnProduct(wrapper) {
    const productEl = wrapper.querySelector("catalogue-product");
    if (!productEl) return;

    const data = extractProductData(productEl);

    const existingBadge = wrapper.querySelector("." + BADGE_CLASS);
    if (existingBadge) existingBadge.remove();

    if (!data) {
      wrapper.setAttribute(BADGE_ATTR, "no-data");
      return;
    }

    const badge = document.createElement("div");
    badge.className = BADGE_CLASS;

    const label = unitLabel(data.unitType);
    const hasDiscount = data.discountRatio < 0.999;

    if (hasDiscount) {
      badge.classList.add("coto-sorter-badge-discount");
      badge.textContent = `$/${label}: ${formatPrice(data.adjustedUnitPrice)}`;
    } else {
      badge.classList.add("coto-sorter-badge-regular");
      badge.textContent = `$/${label}: ${formatPrice(data.listedUnitPrice)}`;
    }

    const cardContainer = wrapper.querySelector(".card-container");
    if (cardContainer) {
      cardContainer.insertBefore(badge, cardContainer.firstChild);
    } else {
      wrapper.insertBefore(badge, wrapper.firstChild);
    }

    wrapper.setAttribute(BADGE_ATTR, "done");
  }

  /** Inyecta badges en todos los wrappers de producto. */
  function injectAllBadges() {
    const wrappers = document.querySelectorAll(".producto-card");
    debugLog(`Injecting badges on ${wrappers.length} products`);
    wrappers.forEach(injectBadgeOnProduct);
  }

  /** Remueve todos los badges inyectados y resetea atributos. */
  function removeAllBadges() {
    document.querySelectorAll("." + BADGE_CLASS).forEach((el) => el.remove());
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => {
      el.removeAttribute(BADGE_ATTR);
    });
  }

  return { extractProductData, injectBadgeOnProduct, injectAllBadges, removeAllBadges };
})();
