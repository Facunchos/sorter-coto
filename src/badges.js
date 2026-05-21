// badges.js — Extracción de datos de producto e inyección de badges
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.badges = (function () {
  "use strict";

  const { UNIT_PRICE_REGEX, UNIT_QTY_REGEX, BADGE_CLASS, BADGE_ATTR,
          parsePrice, formatPrice, normalizeUnitType, unitLabel } = window.CotoSorter.utils;
  const { resolveBrand } = window.CotoSorter.promoUtils;

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

    // Precio mostrado (lo que pagas)
    const h4 = productEl.querySelector("h4.card-title");
    const displayedFromH4 = h4 ? parsePrice(h4.textContent) : NaN;

    const cardContainer = productEl.matches?.("[data-cnstrc-item-price]")
      ? productEl
      : productEl.querySelector("[data-cnstrc-item-price]");
    const displayedFromAttr = cardContainer
      ? parseFloat(cardContainer.getAttribute("data-cnstrc-item-price"))
      : NaN;

    // Precio regular — fuente primaria: texto "Precio Regular".
    let regularPrice = NaN;
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

    // Fallback: data-cnstrc-item-price (a veces trae precio actual/promo).
    if (isNaN(regularPrice) || regularPrice <= 0) {
      if (cardContainer) {
        regularPrice = parseFloat(cardContainer.getAttribute("data-cnstrc-item-price"));
      }
    }

    let displayedPrice = NaN;
    const displayedCandidates = [displayedFromH4, displayedFromAttr]
      .filter((n) => Number.isFinite(n) && n > 0);

    if (displayedCandidates.length > 0) {
      displayedPrice = displayedCandidates[0];
      if (Number.isFinite(regularPrice) && regularPrice > 0) {
        const underRegular = displayedCandidates.find((n) => n < regularPrice);
        if (Number.isFinite(underRegular)) displayedPrice = underRegular;
      }
    }

    if (isNaN(regularPrice) || regularPrice <= 0) {
      regularPrice = displayedPrice;
    }

    const hasDiscount =
      Number.isFinite(displayedPrice) && displayedPrice > 0 &&
      Number.isFinite(regularPrice) && regularPrice > 0 &&
      displayedPrice < regularPrice;

    // Misma regla de tres que Vista Ligera:
    // (precioDescuento * precioPorXRegular) / precioRegular
    const adjustedUnitPrice = hasDiscount
      ? ((displayedPrice * listedUnitPrice) / regularPrice)
      : listedUnitPrice;

    const discountRatio = hasDiscount ? (displayedPrice / regularPrice) : 1;

    return {
      unitType: type,
      unitRawLabel: rawUnitType,
      listedUnitPrice,
      adjustedUnitPrice,
      displayedPrice,
      regularPrice,
      discountRatio,
    };
  }

  // ---- Badge Injection ----

  /** Inyecta o actualiza el badge de precio en un card wrapper. */
  function injectBadgeOnProduct(wrapper) {
    const productEl = wrapper.querySelector("catalogue-product, constructor-result-item, .card-container");
    if (!productEl) return;

    const data = extractProductData(productEl);
    const formatPrice = window.CotoSorter?.utils?.formatPrice || ((value) => String(value));

    const existingBadge = wrapper.querySelector("." + BADGE_CLASS);
    if (existingBadge) existingBadge.remove();

    const nameEl = productEl.querySelector(".nombre-producto, h3, h4.card-title, .card-title");
    const name = String(nameEl?.textContent || nameEl?.innerText || "").trim();
    const hrefEl = wrapper.querySelector("a[href]") || productEl.querySelector("a[href]");
    const imgEl = wrapper.querySelector("img") || productEl.querySelector("img");
    const favoriteData = name ? {
      name,
      brand: resolveBrand({ name }),
      href: String(hrefEl?.href || ""),
      imgSrc: String(imgEl?.src || ""),
      searchTerm: name,
      // Keep a price snapshot so favorites render immediately with Vista Ligera-like keys.
      priceText: data ? formatPrice(data.regularPrice || data.displayedPrice || 0) : "",
      discountedPriceText: data && data.discountRatio < 0.999 ? formatPrice(data.displayedPrice || 0) : null,
      activePrice: data ? data.displayedPrice : null,
      referencePrice: data ? data.regularPrice : null,
      adjustedReferencePrice: data ? data.adjustedUnitPrice : null,
      discountRatio: data ? data.discountRatio : 1,
      promoPriceRaw: data && data.discountRatio < 0.999 ? data.displayedPrice : null,
      promoTags: data && data.discountRatio < 0.999 ? ["Favorito verificado"] : [],
      lastCheckedAt: Date.now(),
    } : null;

    if (favoriteData && window.CotoSorter.favorites && window.CotoSorter.favorites.buildFavoriteId) {
      favoriteData.id = window.CotoSorter.favorites.buildFavoriteId(favoriteData);
    }

    const existingFavorite = wrapper.querySelector(".coto-sorter-favorite-btn");
    if (existingFavorite) existingFavorite.remove();

    if (favoriteData) {
      const favoriteBtn = document.createElement("button");
      favoriteBtn.type = "button";
      favoriteBtn.className = "coto-sorter-favorite-btn";
      favoriteBtn.setAttribute("aria-label", "Guardar en favoritos");

      favoriteBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!window.CotoSorter.shoppingList) return;
        await window.CotoSorter.shoppingList.toggleFavoriteFromCard(favoriteData);
        if (window.CotoSorter.shoppingList.refreshFavoriteButton) {
          window.CotoSorter.shoppingList.refreshFavoriteButton(favoriteBtn, favoriteData);
        }
      });

      wrapper.insertBefore(favoriteBtn, wrapper.firstChild);
      if (window.CotoSorter.shoppingList && window.CotoSorter.shoppingList.refreshFavoriteButton) {
        window.CotoSorter.shoppingList.refreshFavoriteButton(favoriteBtn, favoriteData);
      } else {
        favoriteBtn.textContent = "♡";
      }
    }

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
