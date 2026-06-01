// shoppingList.js — Modal de lista de compras y batch runner por pestañas
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.shoppingList = (function () {
  "use strict";

  const { normalizeAccents } = window.CotoSorter.utils;
  const { debugLog } = window.CotoSorter.logger;
  const { favorites } = window.CotoSorter;

  const HASH_KEY = "coto-sorter-batch";
  const SESSION_PREFIX = "cotoSorterBatchStarted:";
  const VERIFY_HASH_KEY = "coto-sorter-verify-fav";
  const VERIFY_SESSION_PREFIX = "cotoSorterFavoriteVerifyStarted:";
  const BATCH_QUEUE_KEY = "cotoSorterBatchQueueV1";
  const BATCH_LOCK_KEY = "cotoSorterBatchLockV1";
  const OVERLAY_CLASS = "coto-sorter-shopping-overlay";
  let favoritesStorageListener = null;

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

  function normalizeDirectHref(href) {
    const raw = String(href || "").trim();
    if (!raw) return null;

    try {
      return new URL(raw, window.location.origin).toString();
    } catch {
      return null;
    }
  }

  function buildBatchUrl(item) {
    const url = buildSearchUrl(item.searchTerm || item.name);
    if (!url) return null;
    const batchId = encodeURIComponent(item.id || toSlug(item.searchTerm || item.name));
    return `${url}#${HASH_KEY}=${batchId}`;
  }

  function buildFavoriteVerifyUrl(favorite) {
    const favoriteId = encodeURIComponent(String(favorite?.id || ""));
    if (!favoriteId) return null;
    const url = normalizeDirectHref(favorite?.href);
    if (!url) return null;

    debugLog("Favorite verify URL built", {
      favoriteId: String(favorite?.id || ""),
      source: "direct-href",
      url,
    });

    return `${url}#${VERIFY_HASH_KEY}=${favoriteId}`;
  }

  function getHashParam(key) {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    return params.get(key);
  }

  function getBatchItemIdFromLocation() {
    return getHashParam(HASH_KEY);
  }

  function getVerifyFavoriteIdFromLocation() {
    return getHashParam(VERIFY_HASH_KEY);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isFavoriteVerifyPageReady() {
    return document.querySelectorAll(".producto-card").length > 0 || !!document.querySelector("[data-cnstrc-product-detail]");
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
    let verifyFavoriteId = getVerifyFavoriteIdFromLocation();
    let verifySource = verifyFavoriteId ? 'hash' : null;
    if (!verifyFavoriteId) {
      try {
        const pending = localStorage.getItem('cotoSorterPendingVerify');
        if (pending) {
          verifyFavoriteId = String(pending);
          verifySource = 'localstorage';
          // clear key so subsequent tabs don't pick it up
          try { localStorage.removeItem('cotoSorterPendingVerify'); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        /* ignore */
      }
    }

    if (!verifyFavoriteId) {
      try {
        const queue = readBatchQueue();
        const queuedItemId = queue[0] ? String(queue[0]) : "";
        if (queuedItemId.startsWith("verify:")) {
          verifyFavoriteId = queuedItemId.replace(/^verify:/, "");
          verifySource = 'batch-queue';
        }
      } catch (e) {
        /* ignore */
      }
    }

    // If still no verify id, try to map current URL to a queued batch item saved by tabRunner
    if (!verifyFavoriteId) {
      try {
        const raw = localStorage.getItem('cotoSorterBatchItemsV1');
        if (raw) {
          const items = JSON.parse(raw);
          if (Array.isArray(items)) {
            const current = String(window.location.href).split('#')[0];
            const found = items.find((it) => String(it?.url || '').split('#')[0] === current);
            if (found && found.id) {
              verifyFavoriteId = String(found.id);
              verifySource = 'batch-items';
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
    }

    if (verifyFavoriteId) {
      const verifySessionKey = VERIFY_SESSION_PREFIX + verifyFavoriteId;
      if (sessionStorage.getItem(verifySessionKey) === "started") {
        return true;
      }

      sessionStorage.setItem(verifySessionKey, "started");
      debugLog("Favorite verify tab detected", {
        verifyFavoriteId,
        verifySource,
        url: window.location.href,
        pageType: document.querySelector("[data-cnstrc-product-detail]") ? "product-detail" : "search-results",
      });

      const hasProducts = await (async () => {
        const limit = 15000;
        const startedAt = Date.now();

        while (Date.now() - startedAt < limit) {
          if (isFavoriteVerifyPageReady()) {
            return true;
          }
          await wait(250);
        }

        return false;
      })();
      if (!hasProducts) {
        debugLog("Favorite verify tab finished waiting without a usable page", {
          verifyFavoriteId,
          url: window.location.href,
        });
        setTimeout(() => {
          try { if (!window.closed) window.close(); } catch (e) { /* ignore */ }
        }, 500);
        return true;
      }

      const runner = window.CotoSorter?.tabRunner;
      const turnKey = `verify:${verifyFavoriteId}`;
      let gotTurn = false;

      if (runner && typeof runner.waitForBatchTurn === "function") {
        gotTurn = await runner.waitForBatchTurn(turnKey);
      }

      if (!gotTurn) {
        debugLog("Favorite verify tab timed out waiting for queue turn", verifyFavoriteId);
        setTimeout(() => {
          try { if (!window.closed) window.close(); } catch (e) { /* ignore */ }
        }, 500);
        return true;
      }

      function normalizeForMatch(value) {
        return toSlug(String(value || ""));
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

      try {
        const favorite = await favorites.getFavoriteById(verifyFavoriteId);
        if (!favorite) {
          debugLog("Favorite verify tab could not find favorite by id", verifyFavoriteId);
          return true;
        }

        debugLog("Favorite verify tab loaded favorite", {
          verifyFavoriteId,
          favoriteHref: favorite.href || null,
          favoriteName: favorite.name || favorite.searchTerm || null,
          pageUrl: window.location.href,
        });

        const svc = window.CotoSorter?.productService;
        const matched = svc && typeof svc.resolveFavoriteProductFromPageUrl === "function"
          ? await svc.resolveFavoriteProductFromPageUrl(window.location.href, favorite)
          : null;
        debugLog("Favorite verify tab resolve result", {
          verifyFavoriteId,
          matched: !!matched,
          matchedName: matched?.name || null,
          matchedHref: matched?.href || null,
        });
        const svcPatch = window.CotoSorter?.productService?.buildFavoriteSnapshot;
        if (matched && typeof svcPatch === "function") {
          const patch = svcPatch(matched, {
            searchTerm: normalizeSearchTerm(favorite.searchTerm || favorite.name),
            writtenText: favorite.writtenText || favorite.searchTerm || favorite.name,
            lastCheckedAt: Date.now(),
          });

          if (patch) {
            await favorites.updateFavorite(favorite.id, patch);
            debugLog("Favorite verify tab updated favorite", favorite.id);
          } else {
            debugLog("Favorite verify tab produced no snapshot patch", {
              verifyFavoriteId,
              matchedName: matched?.name || null,
            });
          }
        } else {
          debugLog("Favorite verify tab found no product match", verifyFavoriteId);
        }
      } catch (err) {
        debugLog("Favorite verify tab failed", {
          verifyFavoriteId,
          url: window.location.href,
          message: err?.message || String(err),
          stack: err?.stack || null,
        });
      } finally {
        let nextTab = null;
        try {
          if (runner && typeof runner.releaseBatchTurn === "function") {
            nextTab = runner.releaseBatchTurn(turnKey);
          }
        } catch (e) {
          /* ignore */
        }

        if (nextTab && nextTab.url) {
          try {
            const opened = window.open(nextTab.url, "_blank", "noopener,noreferrer");
            if (opened && typeof opened.blur === "function") {
              try { opened.blur(); } catch (e) { /* ignore */ }
            }
          } catch (err) {
            debugLog("Favorite verify tab could not open next queued tab", err?.message || err);
          }
        }

        setTimeout(() => {
          try {
            if (!window.closed) {
              window.close();
            }
          } catch (err) {
            debugLog("Favorite verify tab could not close itself", err?.message || err);
          }
        }, 1000);
      }

      return true;
    }

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
      let nextTab = null;
      if (runner && typeof runner.releaseBatchTurn === "function") {
        try { nextTab = runner.releaseBatchTurn(itemId); } catch (e) { /* ignore */ }
      } else {
        try { nextTab = releaseBatchTurn(itemId); } catch (e) { /* ignore */ }
      }

      if (nextTab && nextTab.url) {
        try {
          const opened = window.open(nextTab.url, "_blank", "noopener,noreferrer");
          if (opened && typeof opened.blur === "function") {
            try { opened.blur(); } catch (e) { /* ignore */ }
          }
        } catch (err) {
          debugLog("Batch tab could not open next queued tab", err?.message || err);
        }
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
    if (favoritesStorageListener && chrome?.storage?.onChanged?.removeListener) {
      try {
        chrome.storage.onChanged.removeListener(favoritesStorageListener);
      } catch (e) {
        /* ignore */
      }
    }
    favoritesStorageListener = null;
  }

  function createFavoriteRow(item, checked, onEdit, onDelete, onToggleChecked) {
    const row = document.createElement("div");
    row.className = "coto-sorter-shopping-row coto-sorter-favorite-card";
    if (checked) row.classList.add("is-selected");

    const checkboxWrap = document.createElement("label");
    checkboxWrap.className = "coto-sorter-shopping-row-check coto-sorter-favorite-card-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.dataset.favoriteId = item.id;
    checkbox.addEventListener("change", () => {
      if (onToggleChecked) onToggleChecked(item, checkbox.checked);
    });

    checkboxWrap.appendChild(checkbox);

    const body = document.createElement("div");
    body.className = "coto-sorter-shopping-row-body coto-sorter-favorite-card-body";

    const media = document.createElement("div");
    media.className = "coto-sorter-favorite-card-media";

    const image = document.createElement("img");
    image.className = "coto-sorter-favorite-card-image";
    image.alt = item.name || "Favorito";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    if (item.imgSrc) {
      image.src = item.imgSrc;
    } else {
      image.removeAttribute("src");
      image.dataset.placeholder = "1";
    }

    const priceMeta = window.CotoSorter?.productService?.buildFavoritePriceMeta
      ? window.CotoSorter.productService.buildFavoritePriceMeta(item)
      : null;

    const hoverWrap = document.createElement("div");
    hoverWrap.className = "coto-sorter-favorite-card-hover";

    const hoverTitle = document.createElement("div");
    hoverTitle.className = "coto-sorter-favorite-card-hover-title";
    hoverTitle.textContent = "Last update:";

    const hoverDate = document.createElement("div");
    hoverDate.className = "coto-sorter-favorite-card-hover-date";
    hoverDate.textContent = priceMeta?.checkedAt || "Verificación Pending";

    const hoverStatus = document.createElement("div");
    hoverStatus.className = "coto-sorter-favorite-card-hover-status";
    hoverStatus.textContent = priceMeta?.isSameDay
      ? (priceMeta?.displayPriceText || priceMeta?.currentPriceText || "Verificación Pending")
      : "Update pending";
    hoverStatus.classList.add(priceMeta?.isSameDay ? (priceMeta?.displayPriceClass || priceMeta?.currentPriceClass || "price-regular") : "price-pending");

    if (!priceMeta?.isSameDay) {
      row.classList.add("coto-sorter-fav-row-pending");
    } else if (priceMeta?.hasDiscount) {
      row.classList.add("coto-sorter-fav-row-discount");
    }

    const actions = document.createElement("div");
    actions.className = "coto-sorter-shopping-row-actions coto-sorter-favorite-card-actions";

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

    hoverWrap.appendChild(hoverTitle);
    hoverWrap.appendChild(hoverDate);
    hoverWrap.appendChild(hoverStatus);
    hoverWrap.appendChild(actions);

    media.appendChild(image);
    media.appendChild(hoverWrap);

    row.appendChild(checkboxWrap);
    body.appendChild(media);
    row.appendChild(body);

    row.addEventListener("click", (event) => {
      if (event.target.closest("button, input, label")) return;
      checkbox.checked = !checkbox.checked;
      row.classList.toggle("is-selected", checkbox.checked);
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

  async function openSelectedItems(selectedFavorites, selectedManualLists, options) {
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
    const opts = options || {};

    // If user requested a single combined Vista Ligera, attempt to fetch products
    // for each search and aggregate them into one `generateRevistaHTML` call.
    if (opts.singleVista) {
      closeModal();
      const svc = window.CotoSorter?.productService;
      const vista = window.CotoSorter?.vistaLigera;

      if (!vista || typeof vista.generateRevistaHTML !== "function") {
        alert("No se encontró el generador de Vista Ligera.");
        return;
      }

      const allProducts = [];
      let missingTerms = 0;
      try {
        for (const it of items) {
          const url = buildSearchUrl(it.searchTerm || it.name);
          if (!url) continue;
          let products = [];
          if (svc && typeof svc.extractProductsFromPageUrl === "function") {
            products = await svc.extractProductsFromPageUrl(url);
          } else {
            // best-effort fallback to api scraper if available
            const apiModule = window.CotoSorter?.api;
            if (apiModule && typeof apiModule.scrapeProductsFromPageUrl === "function") {
              products = await apiModule.scrapeProductsFromPageUrl(url) || [];
            }
          }

          if (Array.isArray(products) && products.length > 0) {
            allProducts.push(...products.filter(Boolean));
          } else {
            missingTerms++;
          }
        }

        if (allProducts.length === 0) {
          alert("No se encontraron productos para generar Vista Ligera.");
          return;
        }

        // Normalize via productService when available
        try {
          const svcNorm = window.CotoSorter?.productService;
          if (svcNorm && typeof svcNorm.normalizeApiRecord === "function") {
            // some results may already be normalized; prefer existing normalization
            // but fallback to identity mapping when not available.
            const normalized = allProducts.map((p) => (svcNorm.normalizeApiRecord ? svcNorm.normalizeApiRecord(p) : p) || p);
            vista.generateRevistaHTML(normalized);
          } else {
            vista.generateRevistaHTML(allProducts);
          }
          if (missingTerms > 0) {
            alert(`Se generó la Vista Ligera, pero ${missingTerms} búsquedas no devolvieron productos.`);
          }
        } catch (err) {
          console.debug("Failed to generate combined Vista Ligera", err?.message || err);
          alert("Error generando Vista Ligera.");
        }
      } catch (err) {
        console.debug("openSelectedItems(singleVista) failed", err?.message || err);
        alert("Error al obtener datos para las búsquedas seleccionadas.");
      }

      return;
    }

    closeModal();

    try {
      const tabs = items
        .map((it) => ({ id: it.id, url: buildBatchUrl(it) }))
        .filter((t) => t.url);

      const runner = window.CotoSorter?.tabRunner;
      if (runner && typeof runner.openBatchTabs === "function") {
        await runner.openBatchTabs(tabs, { delayMs: 750, keepFocus: false });
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

    async function runFavoritesScan(targetFavorites, progressCallback) {
      const allFavorites = Array.isArray(targetFavorites) && targetFavorites.length > 0
        ? targetFavorites
        : await favorites.getFavorites();

      if (!allFavorites || allFavorites.length === 0) {
        alert("No hay favoritos guardados para verificar.");
        return;
      }

      const toScan = Array.from(allFavorites);
      const tabs = [];

      debugLog("Favorite verification scan started", {
        favoritesCount: toScan.length,
      });

      for (const fav of toScan) {
        const verifyUrl = buildFavoriteVerifyUrl(fav);
        if (!verifyUrl) {
          debugLog("Favorite verification skipped: missing direct href", {
            favoriteId: fav.id,
            favoriteName: fav.name || fav.searchTerm || null,
          });
          continue;
        }
        tabs.push({ id: `verify:${fav.id}`, url: verifyUrl });
        debugLog("Favorite verification tab queued", {
          favoriteId: fav.id,
          favoriteName: fav.name || fav.searchTerm || null,
          verifyUrl,
        });
      }

      if (tabs.length === 0) {
        alert("No se pudieron construir URLs directas para verificar favoritos.");
        debugLog("Favorite verification scan produced no tabs", {
          favoritesCount: toScan.length,
        });
        return;
      }

      const runner = window.CotoSorter?.tabRunner;

      // If there's only one tab to open, use localStorage signalling so the
      // opened URL can stay clean (no hash fragment). The opened tab will
      // read and clear the `cotoSorterPendingVerify` key.
      if (tabs.length === 1) {
        try {
          localStorage.setItem('cotoSorterPendingVerify', String(tabs[0].id).replace(/^verify:/, ''));
          // strip fragment if present (buildFavoriteVerifyUrl added it)
          const cleanUrl = String(tabs[0].url).split('#')[0];
          tabs[0].url = cleanUrl;
        } catch (e) {
          /* ignore */
        }
      }

      if (runner && typeof runner.openBatchTabs === "function") {
        await runner.openBatchTabs(tabs, { delayMs: 900, keepFocus: false });
      } else {
        for (const [idx, tab] of tabs.entries()) {
          if (typeof progressCallback === "function") progressCallback(`Abriendo verificaciones... (${idx + 1}/${tabs.length})`);
          try { window.open(tab.url, "_blank"); } catch (e) { /* ignore */ }
          await wait(900);
        }
      }

      if (typeof progressCallback === "function") progressCallback("Verificando...");
      debugLog("Favorite verification scan launched", {
        tabsCount: tabs.length,
      });
      alert(`Se iniciaron ${tabs.length} verificaciones en pestañas. Cada pestaña se cierra automáticamente al terminar.`);
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
    favoritesList.className = "coto-sorter-shopping-list coto-sorter-favorites-grid";
    favoritesList.textContent = "Cargando favoritos...";

    favoritesTop.appendChild(favoritesTitle);
    favoritesTop.appendChild(favoritesList);

    const footerActions = document.createElement("div");
    footerActions.className = "coto-sorter-shopping-actions";

    const verifyActions = document.createElement("div");
    verifyActions.className = "coto-sorter-shopping-verify-actions";

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

    // Option: open combined Vista Ligera for all selected searches
    const singleVistaWrap = document.createElement("label");
    singleVistaWrap.className = "coto-sorter-shopping-single-vista";

    const singleVistaCheckbox = document.createElement("input");
    singleVistaCheckbox.type = "checkbox";
    singleVistaCheckbox.checked = false;
    singleVistaCheckbox.title = "Unir búsquedas en una sola Vista Ligera";

    const singleVistaLabel = document.createElement("span");
    singleVistaLabel.textContent = "Unir en una sola Vista Ligera";

    singleVistaWrap.appendChild(singleVistaCheckbox);
    singleVistaWrap.appendChild(singleVistaLabel);

    // Verify favorites button (scans favorites for last-seen price)
    const verifyBtn = document.createElement("button");
    verifyBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    verifyBtn.type = "button";
    verifyBtn.textContent = "Verificar favoritos";
    verifyBtn.title = "Visita las búsquedas de favoritos y guarda el último precio visto";
    verifyBtn.addEventListener("click", async () => {
      verifyBtn.disabled = true;
      const prev = verifyBtn.textContent;
      try {
        const selectedFavorites = favoritesState.filter((item) => selectedFavoriteIds.has(item.id));
        await runFavoritesScan(selectedFavorites, (msg) => { try { verifyBtn.textContent = msg; } catch (e) {} });
      } catch (err) {
        console.error("Favorites scan failed", err);
      }
      verifyBtn.textContent = prev;
      verifyBtn.disabled = false;
    });

    footerActions.appendChild(openBtn);
    footerActions.appendChild(selectAllBtn);
    footerActions.appendChild(deselectAllBtn);

    verifyActions.appendChild(verifyBtn);
    verifyActions.appendChild(singleVistaWrap);

    manualPanel.appendChild(manualSection);
    favoritesPanel.appendChild(favoritesTop);
    panels.appendChild(manualPanel);
    panels.appendChild(favoritesPanel);

    modal.appendChild(header);
    modal.appendChild(tabs);
    modal.appendChild(panels);
    modal.appendChild(footerActions);
    modal.appendChild(verifyActions);
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
    let activeTab = "manual";
    let favoritesLoaded = false;

    function updateActionButtonState() {
      openBtn.disabled = selectedFavoriteIds.size === 0 && selectedManualListIds.size === 0;
    }

    function setActiveTab(tab) {
      activeTab = tab;
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

        const favoriteCheckbox = favoritesList.querySelector(`input[type="checkbox"][data-favorite-id="${item.id}"]`);
        const favoriteCard = favoriteCheckbox?.closest?.(".coto-sorter-favorite-card");
        if (favoriteCard) {
          favoriteCard.classList.toggle("is-selected", checked);
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

    // Set selections only for the currently active tab (manual or favorites)
    function setAllSelections(checked) {
      if (activeTab === "favorites") {
        for (const item of favoritesState) setFavoriteChecked(item, checked);
        favoritesList.querySelectorAll('input[type="checkbox"][data-favorite-id]').forEach((checkbox) => {
          checkbox.checked = checked;
        });
      } else if (activeTab === "manual") {
        for (const item of manualListsState) setManualListChecked(item, checked);
        manualListsList.querySelectorAll('input[type="checkbox"][data-manual-list-id]').forEach((checkbox) => {
          checkbox.checked = checked;
        });
      }

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

    function renderFavoritesList() {
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

            const index = favoritesState.findIndex((favorite) => favorite.id === currentItem.id);
            if (index !== -1) {
              favoritesState[index] = result.favorite;
            }

            renderFavoritesList();
          },
            async (currentItem) => {
              // Deletion is confirmed via the row UI (two clicks). Proceed to remove.
              const removed = await favorites.removeFavorite(currentItem.id);
              if (!removed) {
                alert("No se pudo eliminar el favorito.");
                return;
              }

              selectedFavoriteIds.delete(currentItem.id);
              favoritesState = favoritesState.filter((favorite) => favorite.id !== currentItem.id);
              updateActionButtonState();
              renderFavoritesList();
            },
          (currentItem, checked) => setFavoriteChecked(currentItem, checked)
        );
        favoritesList.appendChild(row);
      }
    }

    async function refreshFavoritesList() {
      if (!favoritesLoaded) {
        favoritesState = await favorites.getFavorites();
        favoritesLoaded = true;
      }

      renderFavoritesList();
    }

    if (!favoritesStorageListener && chrome?.storage?.onChanged?.addListener) {
      favoritesStorageListener = async (changes, areaName) => {
        if (areaName !== "local") return;
        if (!changes || !changes[favorites.STORAGE_KEY]) return;
        favoritesLoaded = false;
        await refreshFavoritesList();
      };

      try {
        chrome.storage.onChanged.addListener(favoritesStorageListener);
      } catch (e) {
        favoritesStorageListener = null;
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
      const manualLists = await favorites.getManualLists();
      const existingByName = manualLists.find((item) => normalizeSearchTerm(item.name) === currentName) || null;

      if (selectedManualList && normalizeSearchTerm(selectedManualList.name) === currentName) {
        result = await favorites.updateManualList(selectedManualList.id, {
          name: currentName,
          text: currentText,
        });
      } else if (!selectedManualList && existingByName) {
        result = await favorites.updateManualList(existingByName.id, {
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
      await openSelectedItems(selectedFavorites, selectedManualLists, { singleVista: singleVistaCheckbox.checked });
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
    let favoriteData = data;

    try {
      const svc = window.CotoSorter?.productService;
      if (svc && typeof svc.resolveFavoriteProductFromPageUrl === "function" && data) {
        const matched = await svc.resolveFavoriteProductFromPageUrl(window.location.href, data);

        if (matched) {
          favoriteData = {
            ...data,
            ...matched,
            activePrice: matched.activePrice ?? data.activePrice,
            referencePrice: matched.referencePrice ?? data.referencePrice,
            productListPrice: matched.productListPrice ?? matched.product_list_price ?? data.productListPrice ?? data.product_list_price,
            priceWithoutTax: matched.priceWithoutTax ?? data.priceWithoutTax,
            discountRatio: matched.discountRatio ?? data.discountRatio,
            promoPriceRaw: matched.promoPriceRaw ?? data.promoPriceRaw,
            promoTags: Array.isArray(matched.promoTags) && matched.promoTags.length > 0 ? matched.promoTags : (data.promoTags || []),
            unitPriceText: matched.unitPriceText ?? data.unitPriceText,
            unitType: matched.unitType ?? data.unitType,
            imgSrc: matched.imgSrc ?? data.imgSrc,
            href: matched.href ?? data.href,
            brand: matched.brand ?? data.brand,
            productBrand: matched.productBrand ?? data.productBrand,
            product_brand: matched.product_brand ?? data.product_brand,
            priceText: matched.priceText ?? data.priceText,
            discountedPriceText: matched.discountedPriceText ?? data.discountedPriceText,
            adjustedReferencePrice: matched.adjustedReferencePrice ?? data.adjustedReferencePrice,
            maxFormatPriceRaw: matched.maxFormatPriceRaw ?? data.maxFormatPriceRaw,
          };
        }
      }
    } catch (err) {
      debugLog("Favorite save enrichment failed; using card snapshot", err?.message || err);
    }

    const result = await favorites.toggleFavorite(favoriteData);
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
