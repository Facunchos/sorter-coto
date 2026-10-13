// bg.js — Background service worker (MV3): cross-origin fetches for "Comparar Precios con Competencia"
// All competitor/Constructor requests happen here (extension origin bypasses CORS).
"use strict";

const PERMISSION_ORIGINS = [
  "https://ac.cnstrc.com/*",
  "https://www.carrefour.com.ar/*",
  "https://diaonline.supermercadosdia.com.ar/*",
];

const ALLOWED_TAB_HOSTS = new Set([
  "www.carrefour.com.ar",
  "diaonline.supermercadosdia.com.ar",
  "www.coto.com.ar",
]);

const STORES = [
  { key: "carrefour", label: "Carrefour", origin: "https://www.carrefour.com.ar" },
  { key: "dia", label: "Día", origin: "https://diaonline.supermercadosdia.com.ar" },
];

const CFG = {
  globalConcurrency: 4,
  perDomainConcurrency: 2,
  perDomainSpacingMs: 300,
  timeoutMs: 10000,
  retries: 2,
  breakerFailures: 5,
  breakerCooldownMs: 60000,
  cacheTtlMs: 30 * 60 * 1000,
};

// =========================================================
// Fetch pool: per-domain throttle + circuit breaker + retries
// =========================================================

const domainStates = new Map();
const taskQueue = [];
let activeGlobal = 0;
let pumpTimer = null;

function domainState(host) {
  if (!domainStates.has(host)) {
    domainStates.set(host, { active: 0, nextAt: 0, fails: 0, breakerUntil: 0 });
  }
  return domainStates.get(host);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt, retryAfterSec) {
  if (retryAfterSec && retryAfterSec > 0) return Math.min(retryAfterSec * 1000, 10000);
  const base = 400 * Math.pow(2, attempt);
  return base + Math.floor(Math.random() * 250);
}

function pump() {
  for (let i = 0; i < taskQueue.length && activeGlobal < CFG.globalConcurrency; i++) {
    const task = taskQueue[i];
    const st = domainState(task.host);
    const now = Date.now();
    if (st.active >= CFG.perDomainConcurrency) continue;
    if (now < st.breakerUntil) continue;
    if (now < st.nextAt) continue;

    taskQueue.splice(i, 1);
    i--;
    activeGlobal++;
    st.active++;
    st.nextAt = Date.now() + CFG.perDomainSpacingMs;

    task.run().finally(() => {
      activeGlobal--;
      st.active--;
      pump();
    });
  }

  if (taskQueue.length > 0) {
    if (!pumpTimer) {
      pumpTimer = setTimeout(() => {
        pumpTimer = null;
        pump();
      }, 150);
    }
  } else if (pumpTimer) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
}

function enqueue(host, run) {
  taskQueue.push({ host, run });
  pump();
}

async function fetchJson(url) {
  const host = new URL(url).host;
  const st = domainState(host);
  if (Date.now() < st.breakerUntil) throw new Error("breaker-open");

  let lastErr = null;
  for (let attempt = 0; attempt <= CFG.retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.timeoutMs);
    try {
      const res = await fetch(url, {
        credentials: "omit",
        cache: "no-store",
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error("http-" + res.status);
        const retryAfter = parseFloat(res.headers.get("Retry-After"));
        await sleep(backoffMs(attempt, retryAfter));
        continue;
      }

      st.fails = 0;
      if (!res.ok) return { ok: false, status: res.status, json: null };
      return { ok: true, status: res.status, json: await res.json() };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < CFG.retries) await sleep(backoffMs(attempt));
    }
  }

  st.fails++;
  if (st.fails >= CFG.breakerFailures) {
    st.breakerUntil = Date.now() + CFG.breakerCooldownMs;
  }
  throw lastErr || new Error("fetch-failed");
}

// =========================================================
// VTEX adapter (Carrefour, Día)
// =========================================================

function sameEan(value, ean) {
  if (value === undefined || value === null) return false;
  const target = String(ean).trim();
  if (Array.isArray(value)) return value.some((v) => String(v).trim() === target);
  return String(value).trim() === target;
}

function pickOffer(item) {
  const sellers = item && Array.isArray(item.sellers) ? item.sellers : [];
  if (!sellers.length) return null;
  return sellers[0].commertialOffer || null;
}

function collectStrings(value, out, depth) {
  if (depth > 4 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value.length <= 120) out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectStrings(v, out, depth + 1));
  } else if (typeof value === "object") {
    Object.keys(value).forEach((k) => collectStrings(value[k], out, depth + 1));
  }
}

function stripBackingField(key) {
  const idx = key.indexOf("k__BackingField");
  const base = idx > 0 ? key.slice(0, idx) : key;
  return base.replace(/^</, "").toLowerCase();
}

function extractPromoTexts(product, offer) {
  const texts = [];
  if (product && Array.isArray(product.discountHighlights)) {
    product.discountHighlights.forEach((h) => {
      if (h && typeof h.name === "string") texts.push(h.name);
    });
  }
  if (offer) {
    [offer.PromotionTeasers, offer.Teasers].forEach((set) => {
      if (!Array.isArray(set)) return;
      set.forEach((t) => {
        if (!t || typeof t !== "object") return;
        Object.keys(t).forEach((k) => {
          const base = stripBackingField(k);
          if ((base === "name" || base === "promo") && typeof t[k] === "string") {
            texts.push(t[k]);
          }
        });
      });
    });
    if (Array.isArray(offer.Teasers)) {
      offer.Teasers.forEach((t) => collectStrings(t, texts, 0));
    }
  }
  return texts;
}

function parsePromo(text) {
  const t = String(text || "");
  let m = t.match(/(\d{1,2})\s*[xX]\s*(\d{1,2})\b/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a >= 2 && b >= 1 && b < a && a <= 10) {
      return { factor: b / a, label: a + "x" + b, text: t };
    }
  }
  m = t.match(/2\s*[dD][oa]\w*\s*(?:unidad\s*)?(?:al|a|con)?\s*(\d{1,2})\s*%/i);
  if (m) {
    const p = parseInt(m[1], 10);
    if (p > 0 && p < 100) return { factor: (2 - p / 100) / 2, label: "2do al " + p + "%", text: t };
  }
  m = t.match(/(\d{1,2})\s*%\s*(?:[dD]to|[dD]escuento|off)/);
  if (m) {
    const p = parseInt(m[1], 10);
    if (p > 0 && p < 100) return { factor: 1 - p / 100, label: p + "% Dto", text: t };
  }
  return null;
}

const CARD_PROMO_RE = /^(tarjeta|mi carrefour|crf)/i;

function bestPromo(texts) {
  const candidates = [];
  texts.forEach((t) => {
    const text = String(t || "").trim();
    if (!text || CARD_PROMO_RE.test(text)) return;
    const p = parsePromo(text);
    if (p) candidates.push(p);
  });
  if (!candidates.length) return null;
  const named = candidates.filter((p) => /^PROMO-/i.test(p.text));
  const pool = named.length ? named : candidates;
  return pool.reduce((best, p) => (!best || p.factor < best.factor ? p : best), null);
}

function parseVtexProduct(product, ean, origin) {
  const items = Array.isArray(product.items) ? product.items : [];
  const item =
    items.find(
      (it) => sameEan(it.ean, ean) || sameEan(it.alternateIds && it.alternateIds.Ean, ean)
    ) || items[0];

  const offer = pickOffer(item);
  if (!offer) return { status: "sin-datos" };

  const price = offer.Price > 0 ? offer.Price : offer.PriceWithoutDiscount;
  const listPrice = offer.ListPrice > 0 ? offer.ListPrice : offer.PriceWithoutDiscount || price;
  const available = offer.IsAvailable !== false && offer.AvailableQuantity !== 0;

  if (!price) return { status: "sin-datos" };
  if (!available) return { status: "no-disponible" };

  // Apply teaser promos (3x2, 2do al X%, X% Dto) only when the API price
  // carries no inline discount, to avoid double-discounting already-reduced prices.
  const promo = bestPromo(extractPromoTexts(product, offer));
  const promoApplied = !!promo && price >= listPrice;
  const effectivePrice = promoApplied ? Math.round(price * promo.factor * 100) / 100 : price;

  const url =
    product.link || (product.linkText ? `${origin}/${product.linkText}/p` : null);

  return {
    status: "ok",
    name: product.productName || null,
    price: effectivePrice,
    basePrice: price,
    listPrice,
    promoLabel: promoApplied ? promo.label : null,
    promoText: promoApplied ? promo.text : null,
    discountPct:
      listPrice > 0 && listPrice > effectivePrice
        ? Math.round((1 - effectivePrice / listPrice) * 100)
        : 0,
    url,
  };
}

async function lookupVtex(store, ean) {
  const url = `${store.origin}/api/catalog_system/pub/products/search/?fq=alternateIds_Ean:${encodeURIComponent(ean)}`;
  const res = await fetchJson(url);
  if (!res.ok) return { status: res.status === 404 ? "sin-datos" : "error" };

  const products = Array.isArray(res.json) ? res.json : [];
  if (!products.length) return { status: "sin-datos" };
  return parseVtexProduct(products[0], ean, store.origin);
}

// =========================================================
// Batch handling per connected tab
// =========================================================

function cacheKey(storeKey, ean) {
  return `cmp:${storeKey}:${String(ean)}`;
}

async function runLookup(port, batch, item, store) {
  if (batch.aborted) return;
  try {
    const data = await lookupVtex(store, item.ean);
    if (batch.aborted) return;

    safePost(port, { type: "result", productId: item.id, store: store.key, data });
    if (data.status === "ok") {
      try {
        await chrome.storage.session.set({
          [cacheKey(store.key, item.ean)]: { at: Date.now(), data },
        });
      } catch { /* cache is best-effort */ }
    }
  } catch (err) {
    if (!batch.aborted) {
      safePost(port, { type: "result", productId: item.id, store: store.key, data: { status: "error" } });
    }
  } finally {
    batch.pending--;
    if (batch.pending === 0 && !batch.aborted) {
      safePost(port, { type: "batch-done" });
    }
  }
}

async function startBatch(port, batch, items) {
  let cached = {};
  try {
    cached = (await chrome.storage.session.get(null)) || {};
  } catch { /* ignore */ }

  const now = Date.now();
  for (const item of items) {
    for (const store of STORES) {
      const entry = cached[cacheKey(store.key, item.ean)];
      if (entry && entry.data && now - entry.at < CFG.cacheTtlMs) {
        safePost(port, { type: "result", productId: item.id, store: store.key, data: entry.data });
        continue;
      }
      batch.pending++;
      enqueue(new URL(store.origin).host, () => runLookup(port, batch, item, store));
    }
  }

  if (batch.pending === 0) safePost(port, { type: "batch-done" });
}

// =========================================================
// Messaging
// =========================================================

function safePost(port, msg) {
  try {
    port.postMessage(msg);
  } catch { /* disconnected port */ }
}

function openTab(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === "https:" && ALLOWED_TAB_HOSTS.has(u.host)) {
      chrome.tabs.create({ url: u.toString() });
    }
  } catch { /* invalid url: ignored */ }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "compare") return;

  let batch = { aborted: false, pending: 0 };

  function startFresh(items) {
    batch.aborted = true;
    batch = { aborted: false, pending: 0 };
    startBatch(port, batch, items);
  }

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "compare") {
      chrome.permissions.contains({ origins: PERMISSION_ORIGINS }, (granted) => {
        if (granted) {
          startFresh(Array.isArray(msg.items) ? msg.items : []);
        } else {
          safePost(port, { type: "need-permission" });
        }
      });
    } else if (msg.type === "request-permission") {
      chrome.permissions.request({ origins: PERMISSION_ORIGINS }, (granted) => {
        safePost(port, { type: "permission", granted: !!granted });
        if (granted && Array.isArray(msg.items)) {
          startFresh(msg.items);
        }
      });
    } else if (msg.type === "open-tab") {
      openTab(msg.url);
    }
  });

  port.onDisconnect.addListener(() => {
    batch.aborted = true;
  });
});
