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
  let pendingQueue = [];
  let flushTimer = null;
  let vlWin = null;

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

  function start() {
    entries = [];
    pendingQueue = [];
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    vlWin = null;
    debugLog("comparePrep: start");
  }

  function offerProducts(products) {
    products.forEach((p) => {
      const entry = { id: "vl" + entries.length, product: p, real: null, stores: {} };
      p.__cmpId = entry.id;
      entries.push(entry);
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
      debugLog("comparePrep: connect failed", err);
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
    const entry = entries.find((e) => e.id === productId);
    if (!entry) return;
    entry.stores[storeKey] = data;
    paintEntry(entry);
    updateButtonState();
  }

  function buildDisplay(entry) {
    const real = entry.real;
    const display = {
      realText: real && real.finalPrice !== null ? fmt(real.finalPrice) : null,
      realPromo: real && real.discountText ? String(real.discountText) : null,
      tiles: {},
    };
    STORE_KEYS.forEach((key) => {
      const d = entry.stores[key];
      if (d && d.status === "ok") {
        display.tiles[key] = {
          status: "ok",
          text: fmt(d.price) + (d.discountPct ? " (-" + d.discountPct + "%)" : ""),
          promo: d.promoLabel || null,
          url: d.url || null,
          lower: real && real.finalPrice !== null ? d.price < real.finalPrice : null,
        };
      } else {
        display.tiles[key] = { status: (d && d.status) || "pending" };
      }
    });
    return display;
  }

  // ---- Pintado directo en el DOM de la ventana VL ----

  function paintEntry(entry) {
    const doc = vlDoc();
    if (!doc) return;
    const row = doc.querySelector(`[data-cmp-id="${entry.id}"]`);
    if (!row) return;
    paintRow(row, buildDisplay(entry));
  }

  function paintRow(row, display) {
    const doc = row.ownerDocument;
    const realEl = row.querySelector(".compare-real");
    if (realEl) {
      realEl.textContent = "";
      if (display.realText) {
        realEl.appendChild(doc.createTextNode("Precio real: " + display.realText));
        if (display.realPromo) {
          realEl.appendChild(doc.createTextNode(" "));
          const chip = doc.createElement("span");
          chip.className = "compare-promo";
          chip.textContent = display.realPromo;
          realEl.appendChild(chip);
        }
      }
    }
    STORE_KEYS.forEach((key) => {
      const tile = row.querySelector(`[data-store="${key}"]`);
      if (tile) paintTile(tile, display.tiles[key]);
    });
  }

  function paintTile(tile, t) {
    const doc = tile.ownerDocument;
    const priceEl = tile.querySelector(".compare-tile-price");
    const oldPromo = tile.querySelector(".compare-promo");
    if (oldPromo) oldPromo.remove();

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

    if (t.promo) {
      const chip = doc.createElement("span");
      chip.className = "compare-promo";
      chip.textContent = t.promo;
      tile.appendChild(chip);
    }

    if (t.url) {
      const url = t.url;
      tile.onclick = function () {
        const w = doc.defaultView;
        if (w) w.open(url, "_blank");
      };
    }
  }

  function updateButtonState() {
    const doc = vlDoc();
    const btn = doc && doc.getElementById("vl-compare-btn");
    if (!btn) return;
    const pending = entries.some(
      (e) => STORE_KEYS.some((k) => !e.stores[k])
    );
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

    for (const entry of entries) {
      if (entry.real && entry.real.ean) {
        entry.stores = {};
        enqueueItem(entry);
      }
    }
    if (!entries.some((e) => e.real && e.real.ean) && btn) {
      btn.textContent = "Sin datos para comparar";
    }
  }

  return { start, offerProducts, noteScrapeDone, attachWindow };
})();
