// shoppingList.js — Modal de lista de compras y batch runner por pestañas
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.shoppingList = (function () {
  "use strict";

  const { normalizeAccents } = window.CotoSorter.utils;
  const { debugLog } = window.CotoSorter.logger;
  const { favorites } = window.CotoSorter;

  const HASH_KEY = "coto-sorter-batch";
  const SESSION_PREFIX = "cotoSorterBatchStarted:";
  const BATCH_QUEUE_KEY = "cotoSorterBatchQueueV1";
  const BATCH_LOCK_KEY = "cotoSorterBatchLockV1";
  const OVERLAY_CLASS = "coto-sorter-shopping-overlay";

  function toSlug(value) {
    return window.CotoSorter.utils.slugify(value);
  }

  function normalizeSearchTerm(value) {
    return String(value || "").trim();
  }

  function parseListLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function buildSearchUrl(term) {
    const slug = toSlug(term);
    if (!slug) return null;
    return `${window.location.origin}/sitios/cdigi/productos/${slug}`;
  }

  function buildBatchUrl(item) {
    const url = buildSearchUrl(item.searchTerm || item.name);
    if (!url) return null;
    const batchId = encodeURIComponent(item.id || toSlug(item.searchTerm || item.name));
    return `${url}#${HASH_KEY}=${batchId}`;
  }

  function getBatchItemIdFromLocation() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    return params.get(HASH_KEY);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  function readBatchQueue() {
    const queue = readJsonStorage(BATCH_QUEUE_KEY, []);
    return Array.isArray(queue) ? queue.filter(Boolean) : [];
  }

  function writeBatchQueue(queue) {
    writeJsonStorage(BATCH_QUEUE_KEY, Array.isArray(queue) ? queue : []);
  }

  // Batch queue/lock are centralized in tabRunner

  async function waitForProducts(maxWaitMs) {
    const limit = Math.max(1000, maxWaitMs || 12000);
    const startedAt = Date.now();

    while (Date.now() - startedAt < limit) {
      if (document.querySelectorAll(".producto-card").length > 0) {
        return true;
      }
      await wait(250);
    }

    return false;
  }

  async function maybeAutoRunBatch() {
    const itemId = getBatchItemIdFromLocation();
    if (!itemId) return false;

    const sessionKey = SESSION_PREFIX + itemId;
    if (sessionStorage.getItem(sessionKey) === "started") {
      return true;
    }

    sessionStorage.setItem(sessionKey, "started");
    debugLog("Batch tab detected; waiting for search results", itemId);

    const hasProducts = await waitForProducts(15000);
    if (!hasProducts) {
      debugLog("Batch tab finished waiting without products", itemId);
      return true;
    }

    const runner = window.CotoSorter?.tabRunner;
    let gotTurn = false;
    if (runner && typeof runner.waitForBatchTurn === "function") {
      gotTurn = await runner.waitForBatchTurn(itemId);
    } else {
      // Local fallback queue using localStorage
      const BATCH_QUEUE_KEY = "cotoSorterBatchQueueV1";
      const BATCH_LOCK_KEY = "cotoSorterBatchLockV1";

      function readJsonStorage(key, fallback) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return fallback;
          const parsed = JSON.parse(raw);
          return parsed == null ? fallback : parsed;
        } catch {
          return fallback;
        }
      }

      function writeJsonStorage(key, value) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          /* ignore */
        }
      }

      function readBatchQueue() { const q = readJsonStorage(BATCH_QUEUE_KEY, []); return Array.isArray(q) ? q.filter(Boolean) : []; }
      function writeBatchQueue(queue) { writeJsonStorage(BATCH_QUEUE_KEY, Array.isArray(queue) ? queue : []); }
      function getBatchLock() { return String(localStorage.getItem(BATCH_LOCK_KEY) || ""); }
      function setBatchLock(id) { try { localStorage.setItem(BATCH_LOCK_KEY, String(id || "")); } catch {} }
      function dequeueBatchItem(id) { const next = readBatchQueue().filter((x) => x !== id); writeBatchQueue(next); }
      function enqueueBatchItem(id) { const q = readBatchQueue(); if (!q.includes(id)) { q.push(id); writeBatchQueue(q); } }

      enqueueBatchItem(itemId);
      const startedAt = Date.now();

      while (Date.now() - startedAt < 180000) {
        const queue = readBatchQueue();
        const lock = getBatchLock();
        if (queue[0] === itemId && (!lock || lock === itemId)) {
          setBatchLock(itemId);
          gotTurn = true;
          break;
        }
        if (!queue.includes(itemId)) enqueueBatchItem(itemId);
        await wait(500);
      }

      if (!gotTurn) {
        dequeueBatchItem(itemId);
      }

    }
    if (!gotTurn) {
      debugLog("Batch tab timed out waiting for its queue turn", itemId);
      return true;
    }

    try {
      const revistaModule = window.CotoSorter.revista;
      if (!revistaModule || typeof revistaModule.startRevistaHTMLGeneration !== "function") {
        debugLog("Batch tab could not find Vista Ligera generator", itemId);
        return true;
      }

      debugLog("Batch tab launching Vista Ligera", itemId);
      await revistaModule.startRevistaHTMLGeneration(null, () => {});
    } finally {
      if (runner && typeof runner.releaseBatchTurn === "function") {
        try { runner.releaseBatchTurn(itemId); } catch (e) { /* ignore */ }
      } else {
        try { releaseBatchTurn(itemId); } catch (e) { /* ignore */ }
      }
      setTimeout(() => {
        try {
          if (!window.closed) {
            window.close();
          }
        } catch (err) {
          debugLog("Batch tab could not close itself", err?.message || err);
        }
      }, 1000);
    }

    return true;
  }

  function closeModal() {
    const overlay = document.querySelector("." + OVERLAY_CLASS);
    if (overlay) overlay.remove();
  }

  function createFavoriteRow(item, checked, onEdit, onDelete, onToggleChecked) {
    const row = document.createElement("div");
    row.className = "coto-sorter-shopping-row";

    const checkboxWrap = document.createElement("label");
    checkboxWrap.className = "coto-sorter-shopping-row-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.dataset.favoriteId = item.id;
    checkbox.addEventListener("change", () => {
      if (onToggleChecked) onToggleChecked(item, checkbox.checked);
    });

    checkboxWrap.appendChild(checkbox);

    const body = document.createElement("div");
    body.className = "coto-sorter-shopping-row-body";

    const text = document.createElement("div");
    text.className = "coto-sorter-shopping-row-text";
    text.textContent = item.name;

    const priceMeta = window.CotoSorter?.productService?.buildFavoritePriceMeta
      ? window.CotoSorter.productService.buildFavoritePriceMeta(item)
      : null;
    const priceBlock = document.createElement("div");
    priceBlock.className = "coto-sorter-fav-price-block";

    const priceLabel = document.createElement("div");
    priceLabel.className = "coto-sorter-fav-price-label";
    priceLabel.textContent = priceMeta.visibleLabel;

    const priceState = document.createElement("span");
    priceState.className = "coto-sorter-fav-price-state";
    priceState.textContent = priceMeta.checkedAt || "Verificación Pending";

    const hoverWrap = document.createElement("div");
    hoverWrap.className = "coto-sorter-fav-price-hover";

    const hoverTitle = document.createElement("div");
    hoverTitle.className = "coto-sorter-fav-price-hover-title";
    hoverTitle.textContent = priceMeta.checkedAt || "Verificación Pending";

    const hoverList = document.createElement("div");
    hoverList.className = "coto-sorter-fav-price-hover-list";

    if (priceMeta.hasSnapshot) {
      const fields = [
        ["Precio regular", priceMeta.tooltipLines.regularPrice],
        ["Descuento", priceMeta.tooltipLines.discountText],
        ["Precio con descuento", priceMeta.tooltipLines.discountedPrice],
        ["Precio actual", priceMeta.tooltipLines.actualPrice],
      ];

      for (const [label, value] of fields) {
        const row = document.createElement("div");
        row.className = "coto-sorter-fav-price-hover-row";

        const rowLabel = document.createElement("span");
        rowLabel.className = "coto-sorter-fav-price-hover-key";
        rowLabel.textContent = label;

        const rowValue = document.createElement("span");
        rowValue.className = "coto-sorter-fav-price-hover-value";
        rowValue.textContent = value;

        row.appendChild(rowLabel);
        row.appendChild(rowValue);
        hoverList.appendChild(row);
      }

      if (priceMeta.hasDiscount) {
        const discountBadge = document.createElement("span");
        discountBadge.className = "badge coto-sorter-fav-discount-badge";
        discountBadge.textContent = `-${priceMeta.discountPct}%`;
        priceBlock.appendChild(priceLabel);
        priceBlock.appendChild(priceState);
        priceBlock.appendChild(discountBadge);
      } else {
        priceBlock.appendChild(priceLabel);
        priceBlock.appendChild(priceState);
      }
    } else {
      const pendingLine = document.createElement("div");
      pendingLine.className = "coto-sorter-fav-price-pending";
      pendingLine.textContent = "Verificación Pending";
      priceBlock.appendChild(priceLabel);
      priceBlock.appendChild(priceState);
      priceBlock.appendChild(pendingLine);
    }

    const hoverTitleDate = document.createElement("div");
    hoverTitleDate.className = "coto-sorter-fav-price-hover-date";
    hoverTitleDate.textContent = priceMeta.tooltipLines.checkedAt;

    const visibleLastLine = document.createElement("div");
    visibleLastLine.className = "coto-sorter-fav-price-visible-line";
    visibleLastLine.textContent = "Último precio";

    const visibleLastValue = document.createElement("div");
    visibleLastValue.className = `coto-sorter-fav-price-visible-value ${priceMeta.lastPriceState}`;
    visibleLastValue.textContent = priceMeta.lastPriceValue !== null ? window.CotoSorter.utils.formatPrice(priceMeta.lastPriceValue) : "Verificación Pending";

    const visibleTodayLine = document.createElement("div");
    visibleTodayLine.className = "coto-sorter-fav-price-visible-line is-today";
    visibleTodayLine.textContent = "Precio actual";

    const visibleTodayValue = document.createElement("div");
    visibleTodayValue.className = `coto-sorter-fav-price-visible-value ${priceMeta.todayPriceState}`;
    visibleTodayValue.textContent = priceMeta.todayPriceValue !== null ? window.CotoSorter.utils.formatPrice(priceMeta.todayPriceValue) : "Verificación Pending";

    hoverWrap.appendChild(hoverTitleDate);
    hoverWrap.appendChild(hoverList);
    priceBlock.appendChild(visibleLastLine);
    priceBlock.appendChild(visibleLastValue);
    priceBlock.appendChild(visibleTodayLine);
    priceBlock.appendChild(visibleTodayValue);
    priceBlock.appendChild(hoverWrap);

    body.appendChild(text);
    body.appendChild(priceBlock);

    const actions = document.createElement("div");
    actions.className = "coto-sorter-shopping-row-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "coto-sorter-shopping-icon-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Editar favorito";
    editBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onEdit) onEdit(item);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "coto-sorter-shopping-icon-btn coto-sorter-shopping-icon-danger";
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Eliminar favorito";
    // Two-click confirm deletion (matches manual lists behavior)
    deleteBtn.dataset.confirming = "0";
    deleteBtn.dataset.favDeleteId = item.id;
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const confirming = deleteBtn.dataset.confirming === "1";
      if (!confirming) {
        deleteBtn.dataset.confirming = "1";
        // use a compact white-check on red circle to avoid layout break
        deleteBtn.textContent = "✔";
        deleteBtn.classList.add("is-danger", "is-confirming");
        return;
      }

      // second click — perform delete
      deleteBtn.dataset.confirming = "0";
      deleteBtn.textContent = "🗑";
      deleteBtn.classList.remove("is-danger", "is-confirming");
      if (onDelete) onDelete(item);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(checkboxWrap);
    row.appendChild(body);
    row.appendChild(actions);

    row.addEventListener("click", (event) => {
      if (event.target.closest("button, input, label")) return;
      checkbox.checked = !checkbox.checked;
      if (onToggleChecked) onToggleChecked(item, checkbox.checked);
    });

    return row;
  }

  function createManualListRow(item, isActive, checked, onSelect, onToggleChecked) {
    const row = document.createElement("div");
    row.className = "coto-sorter-shopping-row coto-sorter-shopping-manual-row";
    if (isActive) row.classList.add("is-active");

    const checkboxWrap = document.createElement("label");
    checkboxWrap.className = "coto-sorter-shopping-row-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.dataset.manualListId = item.id;
    checkbox.addEventListener("change", () => {
      if (onToggleChecked) onToggleChecked(item, checkbox.checked);
    });

    checkboxWrap.appendChild(checkbox);

    const body = document.createElement("button");
    body.type = "button";
    body.className = "coto-sorter-shopping-manual-item";
    if (isActive) body.classList.add("is-active");

    const text = document.createElement("div");
    text.className = "coto-sorter-shopping-manual-item-text";
    text.textContent = item.name;

    const meta = document.createElement("div");
    meta.className = "coto-sorter-shopping-manual-item-meta";
    meta.textContent = `${parseListLines(item.text).length} ítems`;

    body.appendChild(text);
    body.appendChild(meta);
    body.addEventListener("click", () => {
      if (onSelect) onSelect(item);
    });

    row.addEventListener("click", (event) => {
      if (event.target.closest("button, input, label")) return;
      checkbox.checked = !checkbox.checked;
      if (onToggleChecked) onToggleChecked(item, checkbox.checked);
    });

    row.appendChild(checkboxWrap);
    row.appendChild(body);
    return row;
  }

  function parseFavoriteEditInput(raw, currentItem) {
    const parts = String(raw || "")
      .split("\n")
      .map((part) => part.trim());

    const nextName = parts[0] || currentItem.name;
    if (!nextName) return null;

    return {
      name: nextName,
      searchTerm: parts[1] || currentItem.searchTerm || nextName,
      writtenText: parts[1] || currentItem.writtenText || parts[0] || nextName,
    };
  }

  async function openSelectedItems(selectedFavorites, selectedManualLists) {
    const items = [];

    for (const fav of selectedFavorites) {
      items.push({
        id: fav.id,
        name: fav.name,
        brand: fav.brand,
        searchTerm: normalizeSearchTerm(fav.searchTerm || fav.name),
      });
    }

    for (const manualList of selectedManualLists) {
      const listLines = parseListLines(manualList.text);
      for (const [index, term] of listLines.entries()) {
        const normalizedTerm = normalizeSearchTerm(term);
        if (!normalizedTerm) continue;
        items.push({
          id: `${manualList.id}:${index}:${toSlug(normalizedTerm)}`,
          name: normalizedTerm,
          brand: "",
          searchTerm: normalizedTerm,
        });
      }
    }

    if (items.length === 0) {
      alert("No hay ítems para abrir.");
      return;
    }

    closeModal();

    try {
      const tabs = items
        .map((it) => ({ id: it.id, url: buildBatchUrl(it) }))
        .filter((t) => t.url);

      const runner = window.CotoSorter?.tabRunner;
      if (runner && typeof runner.openBatchTabs === "function") {
        await runner.openBatchTabs(tabs, { delayMs: 750 });
      } else {
        // fallback to original behavior
        for (const t of tabs) {
          window.open(t.url, "_blank");
          await wait(750);
        }
      }
    } catch (err) {
      console.debug("openSelectedItems failed", err?.message || err);
    }
  }

    async function runFavoritesScan() {
      const allFavorites = await favorites.getFavorites();
      if (!allFavorites || allFavorites.length === 0) {
        alert("No hay favoritos guardados para verificar.");
        return;
      }

      const toScan = Array.from(allFavorites);

      function normalizeForMatch(value) {
        return toSlug(String(value || ""));
      }

      function pickMatchingProduct(favorite, products) {
        const favoriteName = normalizeForMatch(favorite?.name || favorite?.searchTerm);
        const favoriteBrand = normalizeForMatch(favorite?.brand);

        const exact = products.find((product) => normalizeForMatch(product?.name) === favoriteName);
        if (exact) return exact;

        const brandMatch = products.find((product) => {
          const productName = normalizeForMatch(product?.name);
          const productBrand = normalizeForMatch(product?.brand || product?.productBrand || product?.brandName);
          return productName === favoriteName && (!favoriteBrand || productBrand === favoriteBrand);
        });
        if (brandMatch) return brandMatch;

        return products.find((product) => normalizeForMatch(product?.name).includes(favoriteName)) || null;
      }

      for (const fav of toScan) {
        try {
          const term = normalizeSearchTerm(fav.searchTerm || fav.name);
          const url = buildSearchUrl(term);
          if (!url) continue;
          let patch = null;

          const svc = window.CotoSorter?.productService;
          let products = [];
          if (svc && typeof svc.extractProductsFromPageUrl === "function") {
            products = await svc.extractProductsFromPageUrl(url);
          } else {
            const apiModule = window.CotoSorter?.api;
            if (apiModule && typeof apiModule.scrapeProductsFromPageUrl === "function") {
              products = await apiModule.scrapeProductsFromPageUrl(url);
            }
          }

          const matched = pickMatchingProduct(fav, products || []);
          const svcPatch = window.CotoSorter?.productService?.buildFavoriteSnapshot;
          patch = matched && typeof svcPatch === "function"
            ? svcPatch(matched, { searchTerm: term, writtenText: fav.writtenText || term, lastCheckedAt: Date.now() })
            : null;

          if (!patch) {
            patch = { lastCheckedAt: Date.now() };
          }

          await favorites.updateFavorite(fav.id, patch);
          await refreshFavoritesList();
          await wait(250);
        } catch (err) {
          console.debug('Error scanning favorite', fav && fav.name, err?.message || err);
        }
      }

      alert('Verificación de favoritos completada.');
    }

  async function openShoppingListModal() {
    closeModal();

    const overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;

    const modal = document.createElement("div");
    modal.className = "coto-sorter-shopping-modal";

    const header = document.createElement("div");
    header.className = "coto-sorter-shopping-header";

    const title = document.createElement("div");
    title.className = "coto-sorter-shopping-title";
    title.textContent = "Lista de compras";

    const subtitle = document.createElement("div");
    subtitle.className = "coto-sorter-shopping-subtitle";
    subtitle.textContent = "Guardá listas manuales, editálas desde el nombre o abrí favoritos guardados como búsquedas separadas.";

    const closeBtn = document.createElement("button");
    closeBtn.className = "coto-sorter-btn coto-sorter-shopping-close";
    closeBtn.type = "button";
    closeBtn.textContent = "Cerrar";
    closeBtn.addEventListener("click", closeModal);

    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(closeBtn);

    const tabs = document.createElement("div");
    tabs.className = "coto-sorter-shopping-tabs";

    const manualTabBtn = document.createElement("button");
    manualTabBtn.type = "button";
    manualTabBtn.className = "coto-sorter-shopping-tab-btn is-active";
    manualTabBtn.textContent = "Listas Manuales";

    const favoritesTabBtn = document.createElement("button");
    favoritesTabBtn.type = "button";
    favoritesTabBtn.className = "coto-sorter-shopping-tab-btn";
    favoritesTabBtn.textContent = "Favoritos Guardados";

    tabs.appendChild(manualTabBtn);
    tabs.appendChild(favoritesTabBtn);

    const panels = document.createElement("div");
    panels.className = "coto-sorter-shopping-panels";

    const manualPanel = document.createElement("section");
    manualPanel.className = "coto-sorter-shopping-tab-panel";

    const favoritesPanel = document.createElement("section");
    favoritesPanel.className = "coto-sorter-shopping-tab-panel";
    favoritesPanel.hidden = true;

    const manualSection = document.createElement("div");
    manualSection.className = "coto-sorter-shopping-section";

    const manualToggleBtn = document.createElement("button");
    manualToggleBtn.type = "button";
    manualToggleBtn.className = "coto-sorter-shopping-collapse-btn";

    const manualToggleText = document.createElement("span");
        manualToggleText.textContent = "Lista Manual";
    const manualToggleCaret = document.createElement("span");
    manualToggleCaret.className = "coto-sorter-shopping-caret";
    manualToggleCaret.textContent = "▾";

    manualToggleBtn.appendChild(manualToggleText);
    manualToggleBtn.appendChild(manualToggleCaret);

    const manualBody = document.createElement("div");
    manualBody.className = "coto-sorter-shopping-collapsible-body";

    const manualLabel = document.createElement("label");
    manualLabel.className = "coto-sorter-shopping-label";
    manualLabel.textContent = "Nombre de la lista";

    const manualNameInput = document.createElement("input");
    manualNameInput.className = "coto-sorter-shopping-name-input";
    manualNameInput.type = "text";
    manualNameInput.placeholder = "Ej: Feria del finde";

    const manualItemsLabel = document.createElement("label");
    manualItemsLabel.className = "coto-sorter-shopping-label";
    manualItemsLabel.textContent = "Ítems manuales (uno por línea)";

    const manualInput = document.createElement("textarea");
    manualInput.className = "coto-sorter-shopping-textarea";
    manualInput.rows = 6;
    manualInput.placeholder = "Leche\nHarina 0000\nManteca 200g";

    const manualStatus = document.createElement("div");
    manualStatus.className = "coto-sorter-shopping-manual-status";

    const manualActions = document.createElement("div");
    manualActions.className = "coto-sorter-shopping-actions coto-sorter-shopping-manual-actions";

    const saveManualBtn = document.createElement("button");
    saveManualBtn.className = "coto-sorter-btn coto-sorter-shopping-primary";
    saveManualBtn.type = "button";
    saveManualBtn.textContent = "Guardar lista";

    const newManualBtn = document.createElement("button");
    newManualBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    newManualBtn.type = "button";
    newManualBtn.textContent = "Nueva lista";

    const deleteManualBtn = document.createElement("button");
    deleteManualBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    deleteManualBtn.type = "button";
    deleteManualBtn.textContent = "Eliminar lista";
    deleteManualBtn.disabled = true;

    manualActions.appendChild(saveManualBtn);
    manualActions.appendChild(newManualBtn);
    manualActions.appendChild(deleteManualBtn);

    const manualListsWrap = document.createElement("div");
    manualListsWrap.className = "coto-sorter-shopping-favorites";

    const manualListsTitle = document.createElement("div");
    manualListsTitle.className = "coto-sorter-shopping-label";
    manualListsTitle.textContent = "Items guardados";

    const manualListsList = document.createElement("div");
    manualListsList.className = "coto-sorter-shopping-list coto-sorter-shopping-manual-list";
    manualListsList.textContent = "Cargando listas manuales...";

    manualListsWrap.appendChild(manualListsTitle);
    manualListsWrap.appendChild(manualListsList);

    manualBody.appendChild(manualLabel);
    manualBody.appendChild(manualNameInput);
    manualBody.appendChild(manualItemsLabel);
    manualBody.appendChild(manualInput);
    manualBody.appendChild(manualStatus);
    manualBody.appendChild(manualActions);

    manualSection.appendChild(manualToggleBtn);
    manualSection.appendChild(manualBody);
    manualSection.appendChild(manualListsWrap);

    const favoritesTop = document.createElement("div");
    favoritesTop.className = "coto-sorter-shopping-section";

    const favoritesTitle = document.createElement("div");
    favoritesTitle.className = "coto-sorter-shopping-label";
    favoritesTitle.textContent = "Favoritos Guardados";

    const favoritesList = document.createElement("div");
    favoritesList.className = "coto-sorter-shopping-list";
    favoritesList.textContent = "Cargando favoritos...";

    favoritesTop.appendChild(favoritesTitle);
    favoritesTop.appendChild(favoritesList);

    const footerActions = document.createElement("div");
    footerActions.className = "coto-sorter-shopping-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "coto-sorter-btn coto-sorter-shopping-primary";
    openBtn.type = "button";
    openBtn.textContent = "Abrir seleccionados";
    openBtn.disabled = true;

    const selectAllBtn = document.createElement("button");
    selectAllBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    selectAllBtn.type = "button";
    selectAllBtn.textContent = "Seleccionar todo";

    const deselectAllBtn = document.createElement("button");
    deselectAllBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    deselectAllBtn.type = "button";
    deselectAllBtn.textContent = "Deseleccionar todo";

    // Verify favorites button (scans favorites for last-seen price)
    const verifyBtn = document.createElement("button");
    verifyBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    verifyBtn.type = "button";
    verifyBtn.textContent = "Verificar favoritos";
    verifyBtn.title = "Visita las búsquedas de favoritos y guarda el último precio visto";
    verifyBtn.addEventListener("click", async () => {
      verifyBtn.disabled = true;
      const prev = verifyBtn.textContent;
      verifyBtn.textContent = "Verificando...";
      try {
        await runFavoritesScan();
      } catch (err) {
        console.error("Favorites scan failed", err);
      }
      verifyBtn.textContent = prev;
      verifyBtn.disabled = false;
    });

    footerActions.appendChild(openBtn);
    footerActions.appendChild(selectAllBtn);
    footerActions.appendChild(deselectAllBtn);
    footerActions.appendChild(verifyBtn);

    manualPanel.appendChild(manualSection);
    favoritesPanel.appendChild(favoritesTop);
    panels.appendChild(manualPanel);
    panels.appendChild(favoritesPanel);

    modal.appendChild(header);
    modal.appendChild(tabs);
    modal.appendChild(panels);
    modal.appendChild(footerActions);
    overlay.appendChild(modal);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);

    let favoritesState = [];
    let manualListsState = [];
    let selectedManualList = null;
    let favoritesExpanded = true;
    let manualEditorExpanded = true;
    let deleteManualConfirmPending = false;
    const selectedFavoriteIds = new Set();
    const selectedManualListIds = new Set();

    function updateActionButtonState() {
      openBtn.disabled = selectedFavoriteIds.size === 0 && selectedManualListIds.size === 0;
    }

    function setActiveTab(tab) {
      manualTabBtn.classList.toggle("is-active", tab === "manual");
      favoritesTabBtn.classList.toggle("is-active", tab === "favorites");
      manualPanel.hidden = tab !== "manual";
      favoritesPanel.hidden = tab !== "favorites";
    }

    function setFavoritesExpanded(expanded) {
      favoritesExpanded = expanded;
      // No-op retained for compatibility with older state callers.
    }

    function setManualEditorExpanded(expanded) {
      manualEditorExpanded = expanded;
      manualBody.hidden = !expanded;
      manualToggleBtn.classList.toggle("is-collapsed", !expanded);
      manualToggleCaret.textContent = expanded ? "▾" : "▸";
    }

    function syncManualDrafts() {
      favorites.saveDraftManualListName(manualNameInput.value);
      favorites.saveDraftText(manualInput.value);
    }

    function setFavoriteChecked(item, checked) {
      if (checked) {
        selectedFavoriteIds.add(item.id);
      } else {
        selectedFavoriteIds.delete(item.id);
      }
      updateActionButtonState();
      // Reset any pending delete confirmation UI for this favorite row
      try {
        const btn = favoritesList.querySelector(`button[data-fav-delete-id="${item.id}"]`);
        if (btn) {
          btn.dataset.confirming = "0";
          btn.textContent = "🗑";
          btn.classList.remove("is-danger", "is-confirming");
        }
      } catch (err) {
        /* ignore DOM lookup errors */
      }
    }

    function setManualListChecked(item, checked) {
      if (checked) {
        selectedManualListIds.add(item.id);
      } else {
        selectedManualListIds.delete(item.id);
      }
      deleteManualConfirmPending = false;
      if (selectedManualList) {
        deleteManualBtn.textContent = "Eliminar lista";
        deleteManualBtn.classList.remove("is-danger", "is-confirming");
      }
      updateActionButtonState();
    }

    function setAllSelections(checked) {
      for (const item of favoritesState) setFavoriteChecked(item, checked);
      for (const item of manualListsState) setManualListChecked(item, checked);

      favoritesList.querySelectorAll('input[type="checkbox"][data-favorite-id]').forEach((checkbox) => {
        checkbox.checked = checked;
      });
      manualListsList.querySelectorAll('input[type="checkbox"][data-manual-list-id]').forEach((checkbox) => {
        checkbox.checked = checked;
      });

      updateActionButtonState();
    }

    async function refreshManualListsList() {
      manualListsState = await favorites.getManualLists();
      manualListsList.textContent = "";

      if (manualListsState.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "coto-sorter-shopping-empty";
        emptyState.textContent = "Todavía no guardaste listas manuales.";
        manualListsList.appendChild(emptyState);
        return;
      }

      for (const item of manualListsState) {
        const row = createManualListRow(
          item,
          selectedManualList?.id === item.id,
          selectedManualListIds.has(item.id),
          async (currentItem) => {
            selectedManualList = currentItem;
            manualNameInput.value = currentItem.name;
            manualInput.value = currentItem.text;
            manualStatus.textContent = `Editando: ${currentItem.name}`;
            deleteManualBtn.disabled = false;
            await favorites.saveDraftManualListName(manualNameInput.value);
            await favorites.saveDraftText(manualInput.value);
            await refreshManualListsList();
            setActiveTab("manual");
          },
          (currentItem, checked) => setManualListChecked(currentItem, checked)
        );
        manualListsList.appendChild(row);
      }
    }

    async function refreshFavoritesList() {
      favoritesState = await favorites.getFavorites();
      favoritesList.textContent = "";

      if (favoritesState.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "coto-sorter-shopping-empty";
        emptyState.textContent = "No hay favoritos guardados todavía.";
        favoritesList.appendChild(emptyState);
        return;
      }

      for (const item of favoritesState) {
        const row = createFavoriteRow(
          item,
          selectedFavoriteIds.has(item.id),
          async (currentItem) => {
            const currentText = [currentItem.name, currentItem.writtenText || currentItem.searchTerm || currentItem.name]
              .filter(Boolean)
              .join("\n");

            const raw = window.prompt(
              "Editar favorito: primera línea = nombre, segunda línea = texto guardado/búsqueda",
              currentText
            );

            if (raw === null) return;

            const patch = parseFavoriteEditInput(raw, currentItem);
            if (!patch || !patch.name) {
              alert("El nombre no puede estar vacío.");
              return;
            }

              const result = await favorites.updateFavorite(currentItem.id, patch);
              if (!result.saved) {
                alert("No se pudo actualizar el favorito.");
                return;
              }

              await refreshFavoritesList();
          },
            async (currentItem) => {
              // Deletion is confirmed via the row UI (two clicks). Proceed to remove.
              const removed = await favorites.removeFavorite(currentItem.id);
              if (!removed) {
                alert("No se pudo eliminar el favorito.");
                return;
              }

              selectedFavoriteIds.delete(currentItem.id);
              updateActionButtonState();
              await refreshFavoritesList();
            },
          (currentItem, checked) => setFavoriteChecked(currentItem, checked)
        );
        favoritesList.appendChild(row);
      }
    }

    async function saveCurrentManualList() {
      const currentName = normalizeSearchTerm(manualNameInput.value);
      const currentText = String(manualInput.value || "").trim();
      const listLines = parseListLines(currentText);

      if (!currentName) {
        alert("Poné un nombre para la lista.");
        return;
      }

      if (listLines.length === 0) {
        alert("La lista necesita al menos un ítem.");
        return;
      }

      syncManualDrafts();

      let result = null;
      const currentSelectedManualId = selectedManualList ? selectedManualList.id : null;
      if (selectedManualList && currentName === selectedManualList.name) {
        result = await favorites.updateManualList(selectedManualList.id, {
          name: currentName,
          text: currentText,
        });
      } else {
        result = await favorites.saveManualList({
          name: currentName,
          text: currentText,
        });
      }

      if (!result || !result.saved) {
        alert("No se pudo guardar la lista.");
        return;
      }

      if (currentSelectedManualId && currentSelectedManualId !== result.manualList.id) {
        selectedManualListIds.delete(currentSelectedManualId);
      }

      selectedManualList = result.manualList;
      selectedManualListIds.add(result.manualList.id);
      manualNameInput.value = result.manualList.name;
      manualInput.value = result.manualList.text;
      manualStatus.textContent = `Guardada: ${result.manualList.name}`;
      deleteManualBtn.disabled = false;
      deleteManualBtn.textContent = "Eliminar lista";
      deleteManualBtn.classList.remove("is-danger", "is-confirming");
      deleteManualConfirmPending = false;
      await favorites.saveDraftManualListName(manualNameInput.value);
      await favorites.saveDraftText(manualInput.value);
      await refreshManualListsList();
      updateActionButtonState();
    }

    manualNameInput.addEventListener("input", () => {
      syncManualDrafts();
      if (selectedManualList && normalizeSearchTerm(manualNameInput.value) !== selectedManualList.name) {
        manualStatus.textContent = `Editando: ${selectedManualList.name}`;
      } else if (selectedManualList) {
        manualStatus.textContent = `Editando: ${selectedManualList.name}`;
      } else {
        manualStatus.textContent = "";
      }
    });

    manualInput.addEventListener("input", () => {
      syncManualDrafts();
      if (selectedManualList) {
        manualStatus.textContent = `Editando: ${selectedManualList.name}`;
      }
    });

    saveManualBtn.addEventListener("click", saveCurrentManualList);

    newManualBtn.addEventListener("click", async () => {
      selectedManualList = null;
      deleteManualBtn.disabled = true;
      deleteManualBtn.textContent = "Eliminar lista";
      deleteManualBtn.classList.remove("is-danger", "is-confirming");
      deleteManualConfirmPending = false;
      manualNameInput.value = "";
      manualInput.value = "";
      manualStatus.textContent = "Nueva lista";
      await favorites.saveDraftManualListName("");
      await favorites.saveDraftText("");
      await refreshManualListsList();
      manualNameInput.focus();
      updateActionButtonState();
    });

    deleteManualBtn.addEventListener("click", async () => {
      if (!selectedManualList) {
        alert("Seleccioná una lista manual para eliminar.");
        return;
      }

      if (!deleteManualConfirmPending) {
        deleteManualConfirmPending = true;
        deleteManualBtn.textContent = "Confirmar eliminado?";
        deleteManualBtn.classList.add("is-danger", "is-confirming");
        return;
      }

      const removed = await favorites.removeManualList(selectedManualList.id);
      if (!removed) {
        alert("No se pudo eliminar la lista.");
        return;
      }

      selectedManualListIds.delete(selectedManualList.id);
      selectedManualList = null;
      manualNameInput.value = "";
      manualInput.value = "";
      manualStatus.textContent = "Lista eliminada";
      deleteManualBtn.disabled = true;
      deleteManualBtn.textContent = "Eliminar lista";
      deleteManualBtn.classList.remove("is-danger", "is-confirming");
      deleteManualConfirmPending = false;
      await favorites.saveDraftManualListName("");
      await favorites.saveDraftText("");
      await refreshManualListsList();
      updateActionButtonState();
    });

    manualToggleBtn.addEventListener("click", () => {
      setManualEditorExpanded(!manualEditorExpanded);
    });

    manualTabBtn.addEventListener("click", () => setActiveTab("manual"));
    favoritesTabBtn.addEventListener("click", () => setActiveTab("favorites"));

    selectAllBtn.addEventListener("click", () => setAllSelections(true));
    deselectAllBtn.addEventListener("click", () => setAllSelections(false));

    openBtn.addEventListener("click", async () => {
      const selectedFavorites = favoritesState.filter((item) => selectedFavoriteIds.has(item.id));
      const selectedManualLists = manualListsState.filter((item) => selectedManualListIds.has(item.id));

      await favorites.saveDraftManualListName(manualNameInput.value);
      await favorites.saveDraftText(manualInput.value);
      await openSelectedItems(selectedFavorites, selectedManualLists);
    });

    manualNameInput.value = await favorites.getDraftManualListName();
    manualInput.value = await favorites.getDraftText();
    manualStatus.textContent = manualNameInput.value ? `Lista pendiente: ${manualNameInput.value}` : "";

    await refreshManualListsList();
    await refreshFavoritesList();
    setActiveTab("manual");
    setManualEditorExpanded(true);
    updateActionButtonState();
  }

  async function toggleFavoriteFromCard(data) {
    const result = await favorites.toggleFavorite(data);
    debugLog(result.saved ? "Favorite saved" : "Favorite removed", data?.name || data?.searchTerm || "");
    return result;
  }

  async function refreshFavoriteButton(buttonEl, data) {
    if (!buttonEl || !data) return;
    const saved = await favorites.isFavorite(data.id);
    buttonEl.classList.toggle("is-saved", saved);
    buttonEl.setAttribute("aria-pressed", saved ? "true" : "false");
    buttonEl.title = saved ? "Quitar de favoritos" : "Guardar en favoritos";
    buttonEl.textContent = saved ? "♥" : "♡";
  }

  return {
    HASH_KEY,
    buildBatchUrl,
    maybeAutoRunBatch,
    openShoppingListModal,
    toggleFavoriteFromCard,
    refreshFavoriteButton,
  };
})();
