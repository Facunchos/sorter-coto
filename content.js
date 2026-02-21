// ===========================================================
// Coto Sorter — Content Script
// Sorts products by real unit price (adjusted for discounts)
// ===========================================================
(function () {
  "use strict";

  // ---- State ----
  let isSorting = false;
  let currentFilter = null; // null | "weight" | "volume" | "100g" | "square" | "unit"
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
    /Precio\s+por\s+(?:1|100)\s+(Kilo(?:gramo)?(?:\s+escurrido)?|Litro|[Gg]ramos?|[Cc]uadrado|[Uu]nidad)\s*:\s*\$([\d\.,]+)/i;
  const UNIT_QTY_REGEX =
    /Precio\s+por\s+(1|100)\s+/i;

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
   * Normalizes unit text to a filter category.
   * "Kilo", "Kilogramo", "Kilogramo escurrido" -> "weight"
   * "Litro" -> "volume"
   * "Gramos", "Gramo" (when qty=100) -> "100g"
   * "Cuadrado" -> "square"
   * "Unidad" -> "unit"
   */
  function normalizeUnitType(unitText, qty) {
    const lower = unitText.toLowerCase().trim();
    if (lower.startsWith("kilo")) return "weight";
    if (lower.startsWith("litro")) return "volume";
    if (lower.startsWith("gramo") && qty === "100") return "100g";
    if (lower.startsWith("cuadrado")) return "square";
    if (lower.startsWith("unidad")) return "unit";
    return null;
  }

  /**
   * Returns display label for the unit type.
   */
  function unitLabel(unitType) {
    switch (unitType) {
      case "weight":  return "kg";
      case "volume":  return "L";
      case "100g":    return "100g";
      case "square":  return "m²";
      case "unit":    return "u";
      default:        return "?";
    }
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

    let qtyStr = "1"; // default quantity prefix
    for (const small of smalls) {
      const text = small.textContent || small.innerText || "";
      const match = text.match(UNIT_PRICE_REGEX);
      if (match) {
        unitMatch = match;
        // Extract the quantity (1 or 100) from the same text
        const qtyMatch = text.match(UNIT_QTY_REGEX);
        if (qtyMatch) qtyStr = qtyMatch[1];
        break;
      }
    }

    if (!unitMatch) return null;

    const rawUnitType = unitMatch[1];         // e.g. "Kilogramo escurrido", "Gramos", "Cuadrado"
    const rawUnitPrice = unitMatch[2];        // e.g. "3.012,32"
    const type = normalizeUnitType(rawUnitType, qtyStr);
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
  const filterDropdownItems = {}; // key -> dropdown item element
  let btnOrdenar = null;
  let btnReset = null;

  // All available filter types with labels
  const FILTER_TYPES = [
    { key: "weight",  label: "$/Kg ↑",     title: "Ordenar por precio real por kilogramo" },
    { key: "volume",  label: "$/L ↑",      title: "Ordenar por precio real por litro" },
    { key: "100g",    label: "$/100g ↑",   title: "Ordenar por precio por 100 gramos" },
    { key: "square",  label: "$/m² ↑",     title: "Ordenar por precio por cuadrado" },
    { key: "unit",    label: "$/Unidad ↑", title: "Ordenar por precio por unidad" },
  ];

  function updateButtonStates() {
    for (const ft of FILTER_TYPES) {
      const item = filterDropdownItems[ft.key];
      if (item) {
        item.classList.toggle("coto-sorter-active", currentFilter === ft.key);
      }
    }
    if (btnOrdenar) {
      const active = FILTER_TYPES.find(ft => ft.key === currentFilter);
      btnOrdenar.textContent = active ? `Ordenar: ${active.label}` : "Ordenar";
      btnOrdenar.classList.toggle("coto-sorter-active", !!active);
    }
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

    // ---- Ordenar button + dropdown ----
    const ordenarWrap = document.createElement("div");
    ordenarWrap.className = "coto-sorter-generate-wrap";

    btnOrdenar = document.createElement("button");
    btnOrdenar.className = "coto-sorter-btn";
    btnOrdenar.textContent = "Ordenar";
    btnOrdenar.title = "Elegir criterio de ordenamiento";

    const ordenarDropdown = document.createElement("div");
    ordenarDropdown.className = "coto-sorter-dropdown";

    for (const ft of FILTER_TYPES) {
      const item = document.createElement("button");
      item.className = "coto-sorter-dropdown-item";
      item.textContent = ft.label;
      item.title = ft.title + " (menor a mayor)";
      item.addEventListener("click", () => {
        ordenarDropdown.classList.remove("coto-sorter-dropdown-open");
        debugLog(`Ordenar dropdown: Sort by ${ft.key}`);
        sortProducts(ft.key);
      });
      filterDropdownItems[ft.key] = item;
      ordenarDropdown.appendChild(item);
    }

    btnOrdenar.addEventListener("click", () => {
      ordenarDropdown.classList.toggle("coto-sorter-dropdown-open");
    });

    ordenarWrap.appendChild(btnOrdenar);
    ordenarWrap.appendChild(ordenarDropdown);
    buttons.appendChild(ordenarWrap);

    // ---- Generar button + dropdown ----
    const generateWrap = document.createElement("div");
    generateWrap.className = "coto-sorter-generate-wrap";

    const btnGenerar = document.createElement("button");
    btnGenerar.className = "coto-sorter-btn";
    btnGenerar.textContent = "Generar";
    btnGenerar.title = "Generar documentos a partir de los productos";
    btnGenerar.addEventListener("click", () => {
      dropdown.classList.toggle("coto-sorter-dropdown-open");
    });

    const dropdown = document.createElement("div");
    dropdown.className = "coto-sorter-dropdown";

    // Product count selector
    const countLabel = document.createElement("label");
    countLabel.className = "coto-sorter-dropdown-label";
    countLabel.textContent = "Cantidad de productos:";
    
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.className = "coto-sorter-dropdown-input";
    countInput.min = "1";
    countInput.placeholder = "ALL";
    countInput.title = "Dejar vacío para todos los productos";
    
    dropdown.appendChild(countLabel);
    dropdown.appendChild(countInput);

    const itemRevista = document.createElement("button");
    itemRevista.className = "coto-sorter-dropdown-item";
    itemRevista.textContent = "📰 Revista Promos";
    itemRevista.title = "Genera un PDF con todos los productos de todas las páginas";
    itemRevista.addEventListener("click", () => {
      dropdown.classList.remove("coto-sorter-dropdown-open");
      const count = countInput.value ? parseInt(countInput.value, 10) : null;
      startRevistaGeneration(count);
    });

    dropdown.appendChild(itemRevista);

    // Progress indicator
    const progressEl = document.createElement("div");
    progressEl.className = "coto-sorter-progress";
    progressEl.innerHTML = `
      <span class="coto-sorter-progress-text">Preparando...</span>
      <div class="coto-sorter-progress-bar-wrap">
        <div class="coto-sorter-progress-bar"></div>
      </div>
    `;

    generateWrap.appendChild(btnGenerar);
    generateWrap.appendChild(dropdown);
    generateWrap.appendChild(progressEl);
    buttons.appendChild(generateWrap);

    // ---- Reset button ----
    btnReset = document.createElement("button");
    btnReset.className = "coto-sorter-btn coto-sorter-btn-reset";
    btnReset.textContent = "Reset";
    btnReset.title = "Restaurar orden original y remover badges";
    btnReset.addEventListener("click", () => {
      debugLog("Button clicked: Reset");
      resetOrder();
    });
    buttons.appendChild(btnReset);

    // ---- Separator ----
    const separator = document.createElement("hr");
    separator.className = "coto-sorter-separator";
    buttons.appendChild(separator);

    // ---- Opiniones! (próximamente) ----
    const btnOpiniones = document.createElement("button");
    btnOpiniones.className = "coto-sorter-btn coto-sorter-btn-opiniones";
    btnOpiniones.textContent = "Opiniones!";
    btnOpiniones.title = "Próximamente";
    btnOpiniones.disabled = true;
    buttons.appendChild(btnOpiniones);

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

  // ---- Revista Promos: Scraping & PDF Generation ----

  // ---- Endeca JSON API helpers ----

  /**
   * Builds the JSON API URL from the current page URL.
   * Adds format=json, No=0, Nrpp=<count>.
   */
  function buildApiUrl(offset, nrpp) {
    const url = new URL(window.location.href);
    url.searchParams.set("format", "json");
    url.searchParams.set("No", String(offset));
    url.searchParams.set("Nrpp", String(nrpp));
    // Remove Angular-specific params that confuse the API
    url.searchParams.delete("_dyncharset");
    return url.toString();
  }

  /**
   * Navigates the Endeca JSON response to find the Category_ResultsList node.
   * Returns null if not found.
   */
  function findResultsList(data) {
    const page = data?.contents?.[0];
    if (!page) return null;

    // Walk all top-level slots looking for Main_Slot → Category_ResultsList
    for (const slotKey of ["Main"]) {
      const slot = page[slotKey];
      if (!Array.isArray(slot)) continue;
      for (const slotItem of slot) {
        if (slotItem["@type"] === "Main_Slot") {
          for (const content of slotItem.contents || []) {
            if (content["@type"] === "Category_ResultsList") {
              return content;
            }
          }
        }
        // Direct ResultsList in Main array
        if (slotItem["@type"] === "Category_ResultsList") {
          return slotItem;
        }
        // Nested inside contents directly
        for (const sub of slotItem.contents || []) {
          if (sub["@type"] === "Category_ResultsList") return sub;
        }
      }
    }
    return null;
  }

  /**
   * Normalizes cFormato string to our internal unit type.
   * "Kilo" / "Kilogramo" → "weight"
   * "Litro"             → "volume"
   * "100 Gramos"        → "100g"
   * "Metro Cuadrado"    → "square"
   * "Unidad"            → "unit"
   */
  function cFormatoToUnitType(cFormato) {
    if (!cFormato) return null;
    const f = cFormato.trim().toLowerCase();
    if (f.startsWith("kilo") || f.startsWith("kg")) return "weight";
    if (f.startsWith("litro") || f.startsWith("lt")) return "volume";
    if (f.startsWith("100")) return "100g";
    if (f.startsWith("metro")) return "square";
    if (f.startsWith("unidad") || f.startsWith("uni")) return "unit";
    return null;
  }

  /**
   * Formats a raw numeric price (as number or string) to "$X.XXX,XX".
   */
  function formatApiPrice(raw) {
    const num = parseFloat(String(raw).replace(",", "."));
    if (isNaN(num)) return null;
    const parts = num.toFixed(2).split(".");
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "$" + intPart + "," + parts[1];
  }

  /**
   * Parses a single inner Endeca record (attributes + detailsAction) into
   * the product object format used by generateRevistaPDF.
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

    // Product page URL: strip query from recordState, prepend /sitios/cdigi/productos
    let href = null;
    const recordState = innerRecord.detailsAction?.recordState;
    if (recordState) {
      const path = recordState.split("?")[0]; // e.g. /copos-maíz-granix-160g/_/R-...
      href = "https://www.cotodigital.com.ar/sitios/cdigi/productos" + path;
    }

    // Price display text
    const priceText = formatApiPrice(activePriceRaw);

    // Unit price text (referencePrice is already price/unit from COTO)
    let unitPriceText = null;
    if (refPriceRaw > 0 && cFormato.trim()) {
      const label = cFormato.trim().replace(/\s+/g, " ");
      unitPriceText = `Precio por 1 ${label}: ${formatApiPrice(refPriceRaw)}`;
    }

    // Badges: tipoOferta without "Todas las Ofertas" + textoLlevando from dtoDescuentos
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
    } catch { /* ignore parse errors */ }

    const offerLabel = get("product.tipoOferta") ? badges[0] || null : null;

    debugLog(`Parsed: ${name} | price=${priceText} | unit=${unitPriceText} | type=${unitType}`);

    return {
      name,
      href,
      imgSrc,
      priceText,
      regularPrice: String(refPriceRaw),
      badges,
      unitPriceText,
      offerLabel,
      unitType,
      activePrice: activePriceRaw,
      unitPrice: refPriceRaw,
    };
  }

  /**
   * Fetches ALL products from the Endeca JSON API in batches.
   * First request discovers totalNumRecs, then fetches remaining batches in parallel.
   * Calls progressCallback(loaded, total).
   */
  async function scrapeAllPages(progressCallback) {
    const BATCH = 50; // number of products per request

    // First request: get total and first batch
    debugLog("Fetching first batch from JSON API...");
    const firstUrl = buildApiUrl(0, BATCH);
    debugLog(`API URL: ${firstUrl}`);

    const firstResp = await fetch(firstUrl, { credentials: "same-origin" });
    if (!firstResp.ok) throw new Error(`API error ${firstResp.status}`);
    const firstData = await firstResp.json();

    const resultsList = findResultsList(firstData);
    if (!resultsList) {
      throw new Error("No se encontró Category_ResultsList en la respuesta de la API. ¿Estás en una página de categoría o búsqueda de COTO?");
    }

    const totalNumRecs = resultsList.totalNumRecs || 0;
    debugLog(`Total products from API: ${totalNumRecs}`);

    if (progressCallback) progressCallback(0, totalNumRecs);

    // Parse first batch
    const allProducts = [];
    const firstRecords = resultsList.records || [];
    for (const outerRecord of firstRecords) {
      for (const innerRecord of outerRecord.records || []) {
        try {
          allProducts.push(parseEndecaRecord(innerRecord));
        } catch (e) {
          debugLog("Error parsing record:", e);
        }
      }
    }

    if (progressCallback) progressCallback(allProducts.length, totalNumRecs);
    debugLog(`First batch: ${allProducts.length}/${totalNumRecs} products`);

    // Fetch remaining batches in parallel groups of 3
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
              try {
                products.push(parseEndecaRecord(innerRecord));
              } catch (e) {
                debugLog("Error parsing record:", e);
              }
            }
          }
          return products;
        })
      );

      for (const batch of results) {
        allProducts.push(...batch);
      }

      if (progressCallback) progressCallback(allProducts.length, totalNumRecs);
      debugLog(`Progress: ${allProducts.length}/${totalNumRecs}`);
    }

    debugLog(`Scraping complete: ${allProducts.length} total products`);
    return allProducts;
  }

  /**
   * Fetches an image URL and returns it as a base64 data URL.
   * Returns null on failure.
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

  /**
   * Sorts products by unit type priority: weight > volume > 100g > square > unit > unknown.
   */
  function sortProductsByUnitType(products) {
    const unitPriority = {
      weight: 1,
      volume: 2,
      "100g": 3,
      square: 4,
      unit: 5,
    };

    return products.slice().sort((a, b) => {
      const typeA = detectUnitTypeFromProduct(a);
      const typeB = detectUnitTypeFromProduct(b);
      const priorityA = unitPriority[typeA] || 99;
      const priorityB = unitPriority[typeB] || 99;
      return priorityA - priorityB;
    });
  }

  /**
   * Detects unit type from a product.
   * API-sourced products have unitType set directly; fallback to unitPriceText.
   */
  function detectUnitTypeFromProduct(product) {
    if (product.unitType) return product.unitType;
    if (!product.unitPriceText) return null;
    const text = product.unitPriceText.toLowerCase();
    if (/kilo/i.test(text)) return "weight";
    if (/litro/i.test(text)) return "volume";
    if (/100\s*gramo/i.test(text)) return "100g";
    if (/cuadrado/i.test(text)) return "square";
    if (/unidad/i.test(text)) return "unit";
    return null;
  }

  /**
   * Generates a PDF "revista" with all products.
   */
  async function generateRevistaPDF(products, progressCallback) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      alert("Error: jsPDF no está disponible.");
      return;
    }

    // A4 landscape
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();   // ~297
    const pageH = doc.internal.pageSize.getHeight();   // ~210

    // Layout config
    const COLS = 6;
    const MARGIN = 10;
    const HEADER_H = 18;
    const GAP = 6;
    const cellW = (pageW - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
    const IMG_H = 30;
    const CELL_H = 62;
    const ROWS_PER_PAGE = Math.floor((pageH - MARGIN - HEADER_H - GAP) / (CELL_H + GAP));

    // Pre-fetch images in batches
    if (progressCallback) progressCallback("imgs", 0, 1);
    const imageCache = {};
    const BATCH = 8;
    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((p) => (p.imgSrc ? fetchImageAsBase64(p.imgSrc) : Promise.resolve(null)))
      );
      for (let j = 0; j < batch.length; j++) {
        if (results[j]) imageCache[batch[j].imgSrc] = results[j];
      }
      if (progressCallback) {
        progressCallback("imgs", Math.min(i + BATCH, products.length), products.length);
      }
    }

    // Draw header on a page
    function drawHeader(pageNum, totalPdfPages) {
      doc.setFillColor(226, 0, 37); // #e20025
      doc.rect(0, 0, pageW, HEADER_H, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("COTO — Revista de Promos", MARGIN, 11);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const dateStr = new Date().toLocaleDateString("es-AR", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.text(dateStr, pageW - MARGIN, 8, { align: "right" });
      doc.text(
        `${products.length} productos — Pág. ${pageNum}/${totalPdfPages}`,
        pageW - MARGIN,
        14,
        { align: "right" }
      );
    }

    const totalPdfPages = Math.ceil(products.length / (COLS * ROWS_PER_PAGE));

    let pdfPage = 1;
    drawHeader(pdfPage, totalPdfPages);

    for (let i = 0; i < products.length; i++) {
      const col = i % COLS;
      const rowOnPage = Math.floor((i % (COLS * ROWS_PER_PAGE)) / COLS);

      // New page check
      if (i > 0 && col === 0 && rowOnPage === 0) {
        doc.addPage();
        pdfPage++;
        drawHeader(pdfPage, totalPdfPages);
      }

      const x = MARGIN + col * (cellW + GAP);
      const y = HEADER_H + GAP + rowOnPage * (CELL_H + GAP);
      const p = products[i];

      // Cell background
      doc.setFillColor(255, 255, 245);
      doc.roundedRect(x, y, cellW, CELL_H, 2, 2, "F");

      // Cell border
      doc.setDrawColor(226, 0, 37);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cellW, CELL_H, 2, 2, "S");

      // Image
      const imgData = p.imgSrc ? imageCache[p.imgSrc] : null;
      if (imgData) {
        try {
          const imgW = IMG_H; // square aspect
          const imgX = x + (cellW - imgW) / 2;
          doc.addImage(imgData, "JPEG", imgX, y + 1, imgW, IMG_H);
        } catch {
          // Image failed, skip
        }
      }

      // Product name (truncated)
      const nameY = y + IMG_H + 3;
      doc.setTextColor(33, 33, 33);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      let displayName = p.name || "Producto";
      if (displayName.length > 50) displayName = displayName.substring(0, 47) + "...";
      const nameLines = doc.splitTextToSize(displayName, cellW - 4);
      doc.text(nameLines.slice(0, 2), x + 2, nameY);

      // Price
      const priceY = nameY + (Math.min(nameLines.length, 2)) * 3 + 1;
      if (p.priceText) {
        doc.setTextColor(226, 0, 37);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(p.priceText, x + 2, priceY);
      }

      // Badges
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

      // Unit price (bottom of cell)
      if (p.unitPriceText) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "normal");
        let upt = p.unitPriceText;
        if (upt.length > 55) upt = upt.substring(0, 52) + "...";
        doc.text(upt, x + 2, y + CELL_H - 2);
      }

      // Clickable link over entire cell
      if (p.href) {
        doc.link(x, y, cellW, CELL_H, { url: p.href });
      }

      if (progressCallback) {
        progressCallback("pdf", i + 1, products.length);
      }
    }

    // Save
    const dateSlug = new Date().toISOString().slice(0, 10);
    doc.save(`revista-promos-COTO-${dateSlug}.pdf`);
  }

  /**
   * Shows/hides/updates the progress indicator in the panel.
   */
  function updateProgress(text, pct) {
    const el = document.querySelector(".coto-sorter-progress");
    if (!el) return;

    const textEl = el.querySelector(".coto-sorter-progress-text");
    const barEl = el.querySelector(".coto-sorter-progress-bar");

    if (text === null) {
      el.classList.remove("coto-sorter-progress-active");
      return;
    }

    el.classList.add("coto-sorter-progress-active");
    if (textEl) textEl.textContent = text;
    if (barEl) barEl.style.width = Math.round(pct) + "%";
  }

  /**
   * Full flow: scrape all pages -> generate PDF.
   * @param {number|null} maxCount - Maximum number of products to include, or null for all
   */
  async function startRevistaGeneration(maxCount = null) {
    try {
      debugLog("Starting Revista Promos generation...");

      updateProgress("Consultando API de COTO...", 5);

      let allProducts = await scrapeAllPages((loaded, total) => {
        const pct = total > 0 ? Math.min((loaded / total) * 50, 50) : 10;
        const label = total > 0
          ? `Obteniendo productos (${loaded}/${total})...`
          : "Obteniendo productos...";
        updateProgress(label, pct);
      });

      if (allProducts.length === 0) {
        updateProgress(null);
        alert("No se encontraron productos en esta página.");
        return;
      }

      debugLog(`Total products scraped: ${allProducts.length}`);

      // Sort by unit type
      allProducts = sortProductsByUnitType(allProducts);
      debugLog("Products sorted by unit type: kg > L > 100g > m² > u");

      // Limit to maxCount if specified
      if (maxCount && maxCount > 0 && maxCount < allProducts.length) {
        allProducts = allProducts.slice(0, maxCount);
        debugLog(`Limited to first ${maxCount} products`);
      }

      updateProgress(`Descargando imágenes...`, 55);

      await generateRevistaPDF(allProducts, (stage, current, total) => {
        if (stage === "imgs") {
          const pct = 50 + (current / total) * 30;
          updateProgress(`Descargando imágenes (${current}/${total})...`, pct);
        } else {
          const pct = 80 + (current / total) * 20;
          updateProgress(`Generando PDF (${current}/${total})...`, pct);
        }
      });

      updateProgress("✓ PDF generado con éxito", 100);
      setTimeout(() => updateProgress(null), 3000);
    } catch (err) {
      console.error("[CotoSorter] Revista generation error:", err);
      updateProgress("✗ Error: " + err.message, 0);
      setTimeout(() => updateProgress(null), 5000);
    }
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
