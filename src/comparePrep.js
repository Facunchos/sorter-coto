// comparePrep.js — Comparación de precios para Vista Ligera (relay + streaming)
// La página VL es un blob: sin chrome.runtime, pero es same-origin con la pestaña
// que la abre, así que este módulo maneja bg.js y pinta los resultados DIRECTAMENTE
// en el DOM de la ventana VL a medida que llegan (sin bloquear la generación).
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.comparePrep = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;

  const FLUSH_MS = 400;
  const FLUSH_MIN = 6;
  const STORE_KEYS = ["carrefour", "dia"];

  const eanCache = new Map();

  let entries = [];
  const entryById = new Map();
  let pendingQueue = [];
  let flushTimer = null;
  let vlWin = null;
  let limit = 0;

  function core() {
    return window.CotoSorter.priceCompare;
  }

  function fmt(value) {
    const c = core();
    return c && c.formatMoney ? c.formatMoney(value) : String(value);
  }

  function vlDoc() {
    try {
      return vlWin && !vlWin.closed ? vlWin.document : null;
    } catch {
      return null;
    }
  }

  function start(limitN) {
    entries = [];
    entryById.clear();
    pendingQueue = [];
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    vlWin = null;
    limit = Number(limitN) > 0 ? Number(limitN) : 0;
    debugLog("comparePrep: start");
  }

  function offerProducts(products) {
    products.forEach((p) => {
      if (limit && entries.length >= limit) return;
      const entry = { id: "vl" + entries.length, product: p, real: null, stores: {} };
      p.__cmpId = entry.id;
      entries.push(entry);
      entryById.set(entry.id, entry);
      resolveEan(entry).then(() => {
        if (entry.real && entry.real.ean) enqueueItem(entry);
      });
    });
  }

  async function resolveEan(entry) {
    const p = entry.product;
    try {
      const c = core();
      if (!c || !c.resolveItemData) return;
      const plu = c.pluFromImgSrc ? c.pluFromImgSrc(p.imgSrc) : null;
      const key = plu || p.name;
      let resolved = eanCache.get(key);
      if (resolved === undefined) {
        resolved = await c.resolveItemData({
          id: plu ? "prod" + plu.padStart(8, "0") : "",
          name: p.name,
        });
        eanCache.set(key, resolved);
      }
      entry.real = resolved;
    } catch (err) {
      debugLog("comparePrep: EAN resolution failed", err);
    }
  }

  function enqueueItem(entry) {
    pendingQueue.push({ id: entry.id, ean: entry.real.ean });
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    if (pendingQueue.length >= FLUSH_MIN) {
      flushNow();
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushNow();
    }, FLUSH_MS);
  }

  function flushNow() {
    if (!pendingQueue.length) return;
    const items = pendingQueue.splice(0, pendingQueue.length);

    let port;
    try {
      port = chrome.runtime.connect({ name: "compare" });
    } catch (err) {
      debugLog("comparePrep: connect failed, requeueing", err);
      pendingQueue.unshift.apply(pendingQueue, items);
      return;
    }

    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "result") {
        applyResult(msg.productId, msg.store, msg.data);
      } else if (msg.type === "batch-done") {
        try { port.disconnect(); } catch { /* ignore */ }
        updateButtonState();
      } else if (msg.type === "need-permission") {
        try {
          port.postMessage({ type: "request-permission", items });
        } catch {
          try { port.disconnect(); } catch { /* ignore */ }
        }
      } else if (msg.type === "permission" && !msg.granted) {
        try { port.disconnect(); } catch { /* ignore */ }
        updateButtonState();
      }
    });
    port.onDisconnect.addListener(() => { /* best-effort */ });
    port.postMessage({ type: "compare", items });
    debugLog("comparePrep: flushed", items.length, "items");
  }

  function noteScrapeDone() {
    flushNow();
  }

  function applyResult(productId, storeKey, data) {
    const entry = entryById.get(productId);
    if (!entry) return;
    entry.stores[storeKey] = data;
    paintEntry(entry);
    updateButtonState();
  }

  function buildDisplay(entry) {
    const real = entry.real;
    const realFinal = real && real.finalPrice !== null ? real.finalPrice : null;
    const display = {
      tiles: {},
    };
    STORE_KEYS.forEach((key) => {
      const d = entry.stores[key];
      if (d && d.status === "ok") {
        const diff = realFinal !== null && Number.isFinite(d.price) ? d.price - realFinal : null;
        display.tiles[key] = {
          status: "ok",
          text: fmt(d.price) + (d.discountPct ? " (-" + d.discountPct + "%)" : ""),
          deltaText: diff !== null && diff !== 0
            ? (diff < 0 ? "-" : "+") + fmt(Math.abs(diff)) +
              (realFinal > 0 ? " (" + (diff < 0 ? "-" : "+") + Math.round(Math.abs(diff) / realFinal * 100) + "%)" : "")
            : null,
          promo: d.promoLabel || null,
          url: d.url || null,
          lower: realFinal !== null ? d.price < realFinal : null,
        };
      } else {
        display.tiles[key] = { status: (d && d.status) || "pending" };
      }
    });
    return display;
  }

  function bestSaving(entry) {
    let best = null;
    STORE_KEYS.forEach((key) => {
      const d = entry.stores[key];
      if (d && d.status === "ok" && entry.real && entry.real.finalPrice !== null && Number.isFinite(d.price)) {
        const diff = d.price - entry.real.finalPrice;
        if (diff < 0 && (best === null || diff < best)) best = diff;
      }
    });
    return best;
  }

  // ---- Pintado directo en el DOM de la ventana VL ----

  function paintEntry(entry) {
    const doc = vlDoc();
    if (!doc) return;
    const row = doc.querySelector(`[data-cmp-id="${entry.id}"]`);
    if (!row) return;
    ensureRowClick(row);

    const card = row.closest(".card-link") || row;
    const best = bestSaving(entry);
    if (best !== null) {
      card.dataset.cmpBest = "1";
      card.dataset.cmpDelta = String(best);
    } else {
      delete card.dataset.cmpBest;
      delete card.dataset.cmpDelta;
    }

    let minPrice = null;
    STORE_KEYS.forEach((key) => {
      const d = entry.stores[key];
      if (d && d.status === "ok" && Number.isFinite(d.price)) {
        if (minPrice === null || d.price < minPrice) minPrice = d.price;
      }
    });
    if (minPrice !== null) card.dataset.cmpBestPrice = String(minPrice);
    else delete card.dataset.cmpBestPrice;

    paintRow(row, buildDisplay(entry));
    doc.dispatchEvent(new CustomEvent("cmp-updated"));
  }

  function ensureRowClick(row) {
    if (row.__cmpClickWired) return;
    row.__cmpClickWired = true;
    row.addEventListener("click", (e) => {
      const tile = e.target.closest ? e.target.closest(".compare-tile") : null;
      const url = tile ? tile.getAttribute("data-url") : null;
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      const w = row.ownerDocument.defaultView;
      if (w) w.open(url, "_blank");
    }, true);
  }

  function paintRow(row, display) {
    STORE_KEYS.forEach((key) => {
      const tile = row.querySelector(`[data-store="${key}"]`);
      if (tile) paintTile(tile, display.tiles[key]);
    });
  }

  function paintTile(tile, t) {
    const doc = tile.ownerDocument;
    const priceEl = tile.querySelector(".compare-tile-price");
    tile.querySelectorAll(".compare-promo, .compare-delta").forEach((el) => el.remove());

    tile.classList.remove("compare-tile-lower", "compare-tile-higher", "compare-tile-na");
    tile.onclick = null;

    if (!t || t.status !== "ok") {
      tile.classList.add("compare-tile-na");
      if (priceEl) priceEl.textContent = !t || t.status === "pending" ? "…" : "sin datos";
      return;
    }

    if (priceEl) priceEl.textContent = t.text;
    if (t.lower === true) tile.classList.add("compare-tile-lower");
    else if (t.lower === false) tile.classList.add("compare-tile-higher");

    if (t.deltaText) {
      const delta = doc.createElement("span");
      delta.className = "compare-delta";
      delta.textContent = t.deltaText;
      tile.appendChild(delta);
    }

    if (t.promo) {
      const chip = doc.createElement("span");
      chip.className = "compare-promo";
      chip.textContent = t.promo;
      tile.appendChild(chip);
    }

    if (t.url) {
      tile.setAttribute("data-url", t.url);
    }
  }

  function updateButtonState() {
    const doc = vlDoc();
    const btn = doc && doc.getElementById("vl-compare-btn");
    if (!btn) return;
    const pending = entries.some((e) => STORE_KEYS.some((k) => !e.stores[k]));
    btn.textContent = pending ? "Comparando…" : "Comparado ✓";
  }

  // ---- Botón interno de la VL: (re)correr la comparación ----

  function attachWindow(win) {
    vlWin = win || null;
    const doc = vlDoc();
    if (!doc) {
      debugLog("comparePrep: no VL window to attach");
      return;
    }

    const btn = doc.getElementById("vl-compare-btn");
    if (btn) {
      btn.addEventListener("click", retry);
    }

    entries.forEach(paintEntry);
    updateButtonState();
  }

  function retry() {
    const doc = vlDoc();
    const btn = doc && doc.getElementById("vl-compare-btn");
    if (btn) btn.textContent = "Comparando…";

    let queued = 0;
    for (const entry of entries) {
      if (entry.real && entry.real.ean) {
        entry.stores = {};
        enqueueItem(entry);
        queued++;
      }
    }
    if (!queued && btn) btn.textContent = "Sin datos para comparar";
  }

  return { start, offerProducts, noteScrapeDone, attachWindow };
})();
