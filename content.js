// ===========================================================
// Coto Sorter — Content Script
// Sorts products by real unit price (adjusted for discounts)
// ===========================================================
(function () {
  "use strict";

  // ---- State ----
  let isSorting = false;
  let currentFilter = null; // null | "weight" | "volume"
  const originalOrder = new Map(); // wrapper element -> original index
  let originalOrderSaved = false;
  let debugEnabled = false;
  let observer = null;
  let debounceTimer = null;

  // ---- Constants ----
  const DEBOUNCE_MS = 400;
  const BADGE_CLASS = "coto-sorter-badge";
  const BADGE_ATTR = "data-coto-sorter-processed";
  const UNIT_PRICE_REGEX =
    /Precio\s+por\s+1\s+(Kilo(?:gramo)?(?:\s+escurrido)?|Litro)\s*:\s*\$([\d\.,]+)/i;

  // ---- Debug Logging ----

  function debugLog(...args) {
    if (debugEnabled) {
      console.log("%c[CotoSorter]", "color:#e20025;font-weight:bold", ...args);
    }
  }

  function initDebugFlag() {
    try {
      chrome.storage.local.get("debug", (result) => {
        debugEnabled = result.debug === true;
        debugLog("Debug mode enabled");
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.debug) {
          debugEnabled = changes.debug.newValue === true;
          debugLog("Debug mode toggled:", debugEnabled);
        }
      });
    } catch {
      // Running outside extension context (e.g. testing) — ignore
      debugEnabled = false;
    }
  }

  // ---- Price Parser ----

  /**
   * Parses Argentine-formatted price string to Number.
   * Examples:
   *   "$3.950,00"  -> 3950.00
   *   "15.960,00"  -> 15960.00
   *   "899,00"     -> 899.00
   *   "1.629"      -> 1629
   *   "$835,52"    -> 835.52
   * Returns NaN if parsing fails.
   */
  function parsePrice(raw) {
    if (raw == null) return NaN;
    const cleaned = String(raw)
      .replace(/\$/g, "")   // Remove dollar sign
      .replace(/\s/g, "")   // Remove whitespace
      .replace(/\./g, "")   // Remove thousands separator (dots)
      .replace(",", ".");   // Replace decimal comma with dot (only first)
    const num = parseFloat(cleaned);
    return num;
  }

  // ---- Unit Type Normalizer ----

  /**
   * Normalizes unit text to "weight" or "volume".
   * "Kilo", "Kilogramo", "Kilogramo escurrido" -> "weight"
   * "Litro" -> "volume"
   */
  function normalizeUnitType(unitText) {
    const lower = unitText.toLowerCase().trim();
    if (lower.startsWith("kilo")) return "weight";
    if (lower.startsWith("litro")) return "volume";
    return null;
  }

  /**
   * Returns display label for the unit type.
   */
  function unitLabel(unitType) {
    return unitType === "weight" ? "kg" : unitType === "volume" ? "L" : "?";
  }

  // ---- Product Data Extraction ----

  /**
   * Extracts all relevant pricing data from a product card element.
   * Returns object with adjusted unit price, or null if not available.
   */
  function extractProductData(productEl) {
    // 1. Find the unit price text among <small> elements
    const smalls = productEl.querySelectorAll("small");
    let unitMatch = null;

    for (const small of smalls) {
      const text = small.textContent || small.innerText || "";
      const match = text.match(UNIT_PRICE_REGEX);
      if (match) {
        unitMatch = match;
        break;
      }
    }

    if (!unitMatch) return null;

    const rawUnitType = unitMatch[1];         // e.g. "Kilogramo escurrido"
    const rawUnitPrice = unitMatch[2];        // e.g. "3.012,32"
    const type = normalizeUnitType(rawUnitType);
    if (!type) return null;

    const listedUnitPrice = parsePrice(rawUnitPrice);
    if (isNaN(listedUnitPrice) || listedUnitPrice <= 0) return null;

    // 2. Get displayed price (what you actually pay) from h4.card-title
    const h4 = productEl.querySelector("h4.card-title");
    const displayedPrice = h4 ? parsePrice(h4.textContent) : NaN;

    // 3. Get regular price — primary source: data-cnstrc-item-price attribute
    const cardContainer = productEl.querySelector("[data-cnstrc-item-price]");
    let regularPrice = NaN;

    if (cardContainer) {
      regularPrice = parseFloat(cardContainer.getAttribute("data-cnstrc-item-price"));
    }

    // Fallback: parse "Precio Regular: $X" text
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

    // If no regular price found, assume no discount
    if (isNaN(regularPrice) || regularPrice <= 0) {
      regularPrice = displayedPrice;
    }

    // 4. Calculate discount ratio
    let discountRatio = 1;
    if (!isNaN(displayedPrice) && displayedPrice > 0 && regularPrice > 0) {
      discountRatio = displayedPrice / regularPrice;
    }

    // 5. Calculate adjusted unit price
    const adjustedUnitPrice = listedUnitPrice * discountRatio;

    // 6. Get product name for debug
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
      name
    };
  }

  // ---- Format price for display ----

  /**
   * Formats a number as Argentine price string.
   * 1348.47 -> "$1.348,47"
   */
  function formatPrice(num) {
    if (isNaN(num)) return "—";
    // Use toFixed(2), then convert to Argentine format
    const parts = num.toFixed(2).split(".");
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "$" + intPart + "," + parts[1];
  }

  // ---- Badge Injection ----

  /**
   * Injects or updates a price badge on a single product card wrapper.
   */
  function injectBadgeOnProduct(wrapper) {
    const productEl = wrapper.querySelector("catalogue-product");
    if (!productEl) return;

    // Extract data
    const data = extractProductData(productEl);

    // Remove existing badge first (to update)
    const existingBadge = wrapper.querySelector("." + BADGE_CLASS);
    if (existingBadge) existingBadge.remove();

    if (!data) {
      wrapper.setAttribute(BADGE_ATTR, "no-data");
      return;
    }

    // Create badge element
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

    // Insert badge inside the card-container for proper positioning
    const cardContainer = wrapper.querySelector(".card-container");
    if (cardContainer) {
      cardContainer.insertBefore(badge, cardContainer.firstChild);
    } else {
      wrapper.insertBefore(badge, wrapper.firstChild);
    }

    wrapper.setAttribute(BADGE_ATTR, "done");
  }

  /**
   * Injects badges on all product wrappers.
   */
  function injectAllBadges() {
    const wrappers = document.querySelectorAll(".producto-card");
    debugLog(`Injecting badges on ${wrappers.length} products`);
    wrappers.forEach(injectBadgeOnProduct);
  }

  /**
   * Removes all injected badges and resets attributes.
   */
  function removeAllBadges() {
    document.querySelectorAll("." + BADGE_CLASS).forEach((el) => el.remove());
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => {
      el.removeAttribute(BADGE_ATTR);
    });
  }

  // ---- Sorting ----

  /**
   * Sorts product cards by adjusted unit price (ascending).
   * @param {"weight" | "volume"} filterType
   */
  function sortProducts(filterType) {
    const container = document.querySelector(".productos.row");
    if (!container) {
      debugLog("ERROR: Product container .productos.row not found");
      return;
    }

    isSorting = true;
    currentFilter = filterType;

    const wrappers = Array.from(container.querySelectorAll(":scope > .producto-card"));
    debugLog(`Sorting ${wrappers.length} product wrappers by ${filterType}`);

    // Save original order on first sort
    if (!originalOrderSaved) {
      wrappers.forEach((w, i) => originalOrder.set(w, i));
      originalOrderSaved = true;
      debugLog("Original order saved");
    }

    // Extract data for each wrapper
    const items = wrappers.map((wrapper) => {
      const productEl = wrapper.querySelector("catalogue-product");
      const data = productEl ? extractProductData(productEl) : null;
      return { wrapper, data };
    });

    // Separate: matching type vs rest
    const withPrice = [];
    const withoutPrice = [];

    for (const item of items) {
      if (item.data && item.data.unitType === filterType) {
        withPrice.push(item);
      } else {
        withoutPrice.push(item);
      }
    }

    // Sort matching items by adjustedUnitPrice ascending
    withPrice.sort((a, b) => a.data.adjustedUnitPrice - b.data.adjustedUnitPrice);

    // Combine: sorted first, then the rest (in original relative order)
    const sorted = [...withPrice, ...withoutPrice];

    // Re-append to container (moves nodes without destroying Angular state)
    for (const item of sorted) {
      container.appendChild(item.wrapper);
    }

    debugLog(
      `Sort complete. ${withPrice.length} products with ${filterType} price, ` +
      `${withoutPrice.length} without.`
    );

    // Inject/update badges
    injectAllBadges();

    // Update UI button states
    updateButtonStates();

    // Re-enable observer after a frame
    requestAnimationFrame(() => {
      isSorting = false;
    });
  }

  /**
   * Resets products to their original order.
   */
  function resetOrder() {
    if (!originalOrderSaved) return;

    const container = document.querySelector(".productos.row");
    if (!container) return;

    isSorting = true;
    currentFilter = null;

    const wrappers = Array.from(container.querySelectorAll(":scope > .producto-card"));

    // Sort by original index
    wrappers.sort((a, b) => {
      const ia = originalOrder.get(a) ?? Infinity;
      const ib = originalOrder.get(b) ?? Infinity;
      return ia - ib;
    });

    for (const w of wrappers) {
      container.appendChild(w);
    }

    removeAllBadges();
    updateButtonStates();
    debugLog("Order reset to original");

    requestAnimationFrame(() => {
      isSorting = false;
    });
  }

  // ---- MutationObserver ----

  function setupObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      if (isSorting) return;

      // Debounce — wait for Angular to finish rendering batch
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debugLog("DOM mutation detected, processing new products...");

        if (currentFilter) {
          // Re-apply sort to integrate new products
          sortProducts(currentFilter);
        } else {
          // Just inject badges on new unprocessed products
          const unprocessed = document.querySelectorAll(
            `.producto-card:not([${BADGE_ATTR}])`
          );
          if (unprocessed.length > 0) {
            debugLog(`Found ${unprocessed.length} new products, injecting badges`);
            unprocessed.forEach(injectBadgeOnProduct);
          }
        }
      }, DEBOUNCE_MS);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    debugLog("MutationObserver started");
  }

  /**
   * Disconnects observer — call on cleanup to prevent memory leaks.
   */
  function teardownObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
      clearTimeout(debounceTimer);
      debugLog("MutationObserver disconnected");
    }
  }

  // ---- UI Injection ----

  let panelEl = null;
  let btnWeight = null;
  let btnVolume = null;
  let btnReset = null;

  function updateButtonStates() {
    if (!btnWeight || !btnVolume || !btnReset) return;

    btnWeight.classList.toggle("coto-sorter-active", currentFilter === "weight");
    btnVolume.classList.toggle("coto-sorter-active", currentFilter === "volume");
  }

  function injectUI() {
    // Prevent duplicate injection
    if (document.querySelector(".coto-sorter-panel")) return;

    panelEl = document.createElement("div");
    panelEl.className = "coto-sorter-panel";

    // Header (drag handle)
    const header = document.createElement("div");
    header.className = "coto-sorter-header";

    const title = document.createElement("span");
    title.className = "coto-sorter-title";
    title.textContent = "Coto Sorter";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.className = "coto-sorter-minimize";
    minimizeBtn.textContent = "−";
    minimizeBtn.title = "Minimizar";
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isMin = panelEl.classList.toggle("coto-sorter-minimized");
      minimizeBtn.textContent = isMin ? "+" : "−";
      minimizeBtn.title = isMin ? "Expandir" : "Minimizar";
    });

    header.appendChild(title);
    header.appendChild(minimizeBtn);

    // Buttons container
    const buttons = document.createElement("div");
    buttons.className = "coto-sorter-buttons";

    btnWeight = document.createElement("button");
    btnWeight.className = "coto-sorter-btn";
    btnWeight.textContent = "Ordenar $/Kg ↑";
    btnWeight.title = "Ordenar por precio real por kilogramo (menor a mayor)";
    btnWeight.addEventListener("click", () => {
      debugLog("Button clicked: Sort by weight");
      sortProducts("weight");
    });

    btnVolume = document.createElement("button");
    btnVolume.className = "coto-sorter-btn";
    btnVolume.textContent = "Ordenar $/L ↑";
    btnVolume.title = "Ordenar por precio real por litro (menor a mayor)";
    btnVolume.addEventListener("click", () => {
      debugLog("Button clicked: Sort by volume");
      sortProducts("volume");
    });

    btnReset = document.createElement("button");
    btnReset.className = "coto-sorter-btn coto-sorter-btn-reset";
    btnReset.textContent = "Reset";
    btnReset.title = "Restaurar orden original y remover badges";
    btnReset.addEventListener("click", () => {
      debugLog("Button clicked: Reset");
      resetOrder();
    });

    buttons.appendChild(btnWeight);
    buttons.appendChild(btnVolume);
    buttons.appendChild(btnReset);

    panelEl.appendChild(header);
    panelEl.appendChild(buttons);

    // Draggable behavior
    makeDraggable(panelEl, header);

    document.body.appendChild(panelEl);
    debugLog("UI panel injected");
  }

  /**
   * Makes an element draggable by a handle.
   */
  function makeDraggable(el, handle) {
    let isDragging = false;
    let startX, startY, origX, origY;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest(".coto-sorter-minimize")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      el.classList.add("coto-sorter-dragging");
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = origX + dx + "px";
      el.style.top = origY + dy + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      el.classList.remove("coto-sorter-dragging");
    });
  }

  // ---- Initialization ----

  function init() {
    debugLog("Initializing Coto Sorter extension");

    injectUI();
    setupObserver();

    // Inject initial badges after a short delay to let Angular finish rendering
    setTimeout(() => {
      const products = document.querySelectorAll(".producto-card");
      if (products.length > 0) {
        debugLog(`Found ${products.length} products on page load`);
        injectAllBadges();
      } else {
        debugLog("No products found yet, observer will handle them");
      }
    }, 500);
  }

  // Init debug flag first, then start
  initDebugFlag();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Cleanup on page unload to prevent memory leaks
  window.addEventListener("unload", teardownObserver);
})();
