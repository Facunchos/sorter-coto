// priceCompare.js — "Comparar Precios con Competencia" + Precio Real del Carrito
// Cart page only. EAN/precio-real come from Constructor.io (CORS *, no extra permissions);
// competitor lookups run in bg.js after an optional-permission grant.
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.priceCompare = (function () {
  "use strict";

  const { debugLog } = window.CotoSorter.logger;

  const CNSTRC_KEY = "key_r6xzz4IAoTWcipni";
  const CNSTRC_BASE = "https://ac.cnstrc.com";
  const DEBOUNCE_MS = 400;

  const TILES_ATTR = "data-coto-sorter-tiles";
  const DISCLAIMER =
    "Precio promocional estimado según datos del sitio. Algunos descuentos tienen topes, medios de pago o condiciones.";

  const STORE_LABELS = { carrefour: "Carrefour", dia: "Día" };
  const STATE_TEXT = {
    "sin-datos": "sin datos",
    "no-disponible": "no disponible",
    error: "error",
    pending: "…",
  };

  let observer = null;
  let debounceTimer = null;
  let scanPromise = null;
  let port = null;
  let comparing = false;
  const itemCache = new Map();

  // =========================================================
  // Helpers
  // =========================================================

  function isCartPage() {
    return /\/carrito/.test(window.location.pathname);
  }

  function formatMoney(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return "$" + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2 }).format(value);
  }

  function parseMoney(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return raw;
    let s = String(raw).replace(/[^\d.,-]/g, "").trim();
    if (!s) return null;
    const hasDot = s.includes(".");
    const hasComma = s.includes(",");
    if (hasDot && hasComma) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (hasComma) {
      s = s.replace(",", ".");
    } else if (hasDot) {
      const tail = s.split(".").pop() || "";
      if (tail.length === 3) s = s.replace(/\./g, "");
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }

  function firstValue(v) {
    if (Array.isArray(v)) return v.length ? v[0] : null;
    return v === undefined ? null : v;
  }

  function pluFromId(id) {
    const m = String(id || "").match(/(\d+)$/);
    return m ? String(parseInt(m[1], 10)) : null;
  }

  function pluFromImgSrc(url) {
    const m = String(url || "").match(/\/(\d{8})\.(?:jpg|jpeg|png|webp)(?:\?|$)/i);
    return m ? String(parseInt(m[1], 10)) : null;
  }

  // =========================================================
  // Cart DOM
  // =========================================================

  function collectCartItems() {
    const byId = new Map();
    document.querySelectorAll("div.c__item-product[data-cnstrc-item-id]").forEach((el) => {
      const id = el.getAttribute("data-cnstrc-item-id");
      if (!id) return;

      let entry = byId.get(id);
      if (!entry) {
        const qtyInput = el.querySelector("input.form-control-input-text") || document.getElementById("input-" + id);
        const qty = qtyInput && parseInt(qtyInput.value, 10) > 0 ? parseInt(qtyInput.value, 10) : 1;
        entry = {
          id,
          name: el.getAttribute("data-cnstrc-item-name") || "",
          regularPrice: parseMoney(el.getAttribute("data-cnstrc-item-price")),
          qty,
          els: [],
        };
        byId.set(id, entry);
      }
      entry.els.push(el);
    });
    return byId;
  }

  // =========================================================
  // Constructor.io resolution (EAN + precio real)
  // =========================================================

  async function fetchCnstrc(url) {
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error("cnstrc-http-" + res.status);
    return res.json();
  }

  function parseCnstrcRecord(data) {
    const ean = firstValue(data.product_main_ean);
    const listPrice = parseMoney(data.product_list_price);
    const discount = Array.isArray(data.discounts) && data.discounts.length ? data.discounts[0] : null;
    const discountPrice = discount ? parseMoney(discount.discountPrice) : null;
    const finalPrice = discountPrice !== null ? discountPrice : listPrice;
    return {
      ean: ean !== null && ean !== undefined ? String(ean) : null,
      listPrice,
      finalPrice,
      discountText: discount && discount.discountText ? String(discount.discountText) : null,
    };
  }

  function pickRecord(results, itemId) {
    if (results && !Array.isArray(results) && typeof results === "object") {
      results = Object.keys(results).map((k) => ({
        data: results[k] && results[k].data ? results[k].data : results[k],
      }));
    }
    if (!Array.isArray(results)) return null;
    const exact = results.find((r) => r && r.data && String(r.data.id || "") === String(itemId));
    if (exact && exact.data) return exact.data;
    const withEan = results.find((r) => r && r.data && firstValue(r.data.product_main_ean));
    return withEan ? withEan.data : results[0] ? results[0].data : null;
  }

  async function resolveItemData(item) {
    const plu = pluFromId(item.id);
    const attempts = [];
    if (plu) attempts.push(`${CNSTRC_BASE}/search/${encodeURIComponent(plu)}?key=${CNSTRC_KEY}&section=Products`);
    attempts.push(`${CNSTRC_BASE}/search/${encodeURIComponent(item.name)}?key=${CNSTRC_KEY}&section=Products`);
    attempts.push(`${CNSTRC_BASE}/item/${encodeURIComponent(item.id)}?key=${CNSTRC_KEY}`);

    for (const url of attempts) {
      try {
        const json = await fetchCnstrc(url);
        const results = json && json.response ? json.response.results : null;
        const data = pickRecord(results, item.id);
        if (data) {
          const parsed = parseCnstrcRecord(data);
          if (parsed.ean || parsed.finalPrice !== null) return parsed;
        }
      } catch (err) {
        debugLog("priceCompare: resolve attempt failed", url, err);
      }
    }
    return null;
  }

  // =========================================================
  // Rendering: precio real, tiles, totals, progress
  // =========================================================

  function renderRealPrice(item) {
    const resolved = item.resolved;
    item.els.forEach((el) => {
      const anchor = el.querySelector(".precio-anterior") || el.querySelector(".info-promo") || el.querySelector(".c__item-detail");
      let row = el.querySelector(".coto-sorter-real-price");
      if (!row) {
        row = document.createElement("div");
        row.className = "coto-sorter-real-price";
        row.title = DISCLAIMER;
        if (anchor && anchor.parentNode) {
          anchor.parentNode.insertBefore(row, anchor.nextSibling);
        } else {
          el.appendChild(row);
        }
      }

      row.classList.remove("coto-sorter-real-discount", "coto-sorter-real-unknown");
      while (row.firstChild) row.removeChild(row.firstChild);

      if (!resolved || resolved.finalPrice === null) {
        row.classList.add("coto-sorter-real-unknown");
        row.textContent = item.failed ? "Precio real: no disponible" : "Precio real: …";
        return;
      }

      const hasDiscount = resolved.listPrice !== null && resolved.finalPrice < resolved.listPrice;
      if (hasDiscount) row.classList.add("coto-sorter-real-discount");

      const label = document.createElement("span");
      label.className = "coto-sorter-real-label";
      label.textContent = "Precio real: ";

      const value = document.createElement("span");
      value.className = "coto-sorter-real-value";
      value.textContent = formatMoney(resolved.finalPrice);

      row.appendChild(label);
      row.appendChild(value);

      if (resolved.discountText) {
        const chip = document.createElement("span");
        chip.className = "coto-sorter-real-promo";
        chip.textContent = resolved.discountText;
        chip.title = DISCLAIMER;
        row.appendChild(chip);
      }
    });
  }

  function renderTotals() {
    let total = 0;
    let ok = false;
    itemCache.forEach((item) => {
      if (item.resolved && item.resolved.finalPrice !== null) {
        total += item.resolved.finalPrice * (item.qty || 1);
        ok = true;
      }
    });

    const text = ok ? "Total real: " + formatMoney(total) : "Total real: no disponible";

    const anchors = [];
    document.querySelectorAll("div.total-precio").forEach((el) => anchors.push(el));
    document
      .querySelectorAll('h4.text-center:has(> span.color-primary)')
      .forEach((el) => anchors.push(el));

    anchors.forEach((anchor) => {
      let chip = anchor.nextElementSibling;
      if (!chip || !chip.classList || !chip.classList.contains("coto-sorter-total-real")) {
        chip = document.createElement("div");
        chip.className = "coto-sorter-total-real";
        chip.title = DISCLAIMER;
        anchor.parentNode.insertBefore(chip, anchor.nextSibling);
      }
      chip.textContent = text;
      chip.classList.toggle("coto-sorter-real-unknown", !ok);
    });
  }

  function ensureTiles(item) {
    item.els.forEach((el) => {
      if (el.getAttribute(TILES_ATTR)) return;
      el.setAttribute(TILES_ATTR, "1");

      const anchor = el.querySelector(".precio-anterior") || el.querySelector(".c__item-detail");
      const row = document.createElement("div");
      row.className = "coto-sorter-compare-tiles";
      row.setAttribute("data-item-id", item.id);

      ["carrefour", "dia"].forEach((store) => {
        const tile = document.createElement("a");
        tile.className = "coto-sorter-tile coto-sorter-tile-pending";
        tile.setAttribute("data-store", store);
        tile.href = "#";
        tile.addEventListener("click", (e) => e.preventDefault());

        const icon = document.createElement("span");
        icon.className = "coto-sorter-tile-icon coto-sorter-icon-" + store;
        icon.textContent = STORE_LABELS[store];

        const price = document.createElement("span");
        price.className = "coto-sorter-tile-price";
        price.textContent = STATE_TEXT.pending;

        tile.appendChild(icon);
        tile.appendChild(price);
        row.appendChild(tile);
      });

      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(row, anchor.nextSibling);
      } else {
        el.appendChild(row);
      }
    });
  }

  function applyResult(productId, store, data) {
    const item = itemCache.get(productId);
    if (!item) return;
    const baseline = item.resolved ? item.resolved.finalPrice : null;

    item.els.forEach((el) => {
      const tile = el.querySelector(`.coto-sorter-tile[data-store="${store}"]`);
      if (!tile) return;

      const priceEl = tile.querySelector(".coto-sorter-tile-price");
      tile.classList.remove("coto-sorter-tile-pending");

      if (!data || data.status !== "ok") {
        const state = (data && data.status) || "error";
        tile.classList.add("coto-sorter-tile-na");
        priceEl.textContent = STATE_TEXT[state] || STATE_TEXT.error;
        tile.removeAttribute("data-url");
        tile.style.cursor = "default";
        return;
      }

      priceEl.textContent = formatMoney(data.price) + (data.discountPct ? ` (-${data.discountPct}%)` : "");
      tile.classList.remove("coto-sorter-tile-na");

      const oldChip = tile.querySelector(".coto-sorter-tile-promo");
      if (oldChip) oldChip.remove();
      if (data.promoLabel) {
        const chip = document.createElement("span");
        chip.className = "coto-sorter-tile-promo";
        chip.textContent = data.promoLabel;
        tile.appendChild(chip);
      }

      if (baseline !== null) {
        tile.classList.add(data.price < baseline ? "coto-sorter-tile-lower" : "coto-sorter-tile-higher");
      }

      tile.title = `${STORE_LABELS[store]}: ${formatMoney(data.price)}` +
        (data.basePrice && data.promoLabel ? ` (base ${formatMoney(data.basePrice)} — ${data.promoText})` : "") +
        (data.listPrice ? ` (lista ${formatMoney(data.listPrice)})` : "") +
        " — clic para ver el producto";

      if (data.url) {
        tile.setAttribute("data-url", data.url);
        tile.style.cursor = "pointer";
        tile.onclick = (e) => {
          e.preventDefault();
          sendMessage({ type: "open-tab", url: data.url });
        };
      }
    });
  }

  function markStuckTiles() {
    document.querySelectorAll(".coto-sorter-tile-pending").forEach((tile) => {
      tile.classList.remove("coto-sorter-tile-pending");
      tile.classList.add("coto-sorter-tile-na");
      const priceEl = tile.querySelector(".coto-sorter-tile-price");
      if (priceEl) priceEl.textContent = STATE_TEXT["sin-datos"];
    });
  }

  // =========================================================
  // Progress + notices
  // =========================================================

  function ensureProgressBar() {
    let bar = document.querySelector(".coto-sorter-cart-progress");
    if (bar) return bar;

    const host = document.querySelector("shopping-cart-main") || document.querySelector("div.card-body-container") || document.body;
    bar = document.createElement("div");
    bar.className = "coto-sorter-cart-progress";

    const text = document.createElement("span");
    text.className = "coto-sorter-progress-text";
    text.textContent = "Preparando...";

    const wrap = document.createElement("div");
    wrap.className = "coto-sorter-progress-bar-wrap";
    const fill = document.createElement("div");
    fill.className = "coto-sorter-progress-bar";
    wrap.appendChild(fill);

    bar.appendChild(text);
    bar.appendChild(wrap);
    host.insertBefore(bar, host.firstChild);
    return bar;
  }

  function updateCartProgress(text, pct) {
    const bar = ensureProgressBar();
    const textEl = bar.querySelector(".coto-sorter-progress-text");
    const barEl = bar.querySelector(".coto-sorter-progress-bar");
    if (text === null) {
      bar.classList.remove("coto-sorter-progress-active");
      return;
    }
    bar.classList.add("coto-sorter-progress-active");
    if (textEl) textEl.textContent = text;
    if (barEl) barEl.style.width = Math.round(pct) + "%";
  }

  function showNotice(text) {
    const existing = document.querySelector(".coto-sorter-notice");
    if (existing) existing.remove();
    const notice = document.createElement("div");
    notice.className = "coto-sorter-notice";
    notice.textContent = text;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 2800);
  }

  // =========================================================
  // Background port
  // =========================================================

  function sendMessage(msg) {
    try {
      if (!port) connectBackground();
      port.postMessage(msg);
    } catch (err) {
      debugLog("priceCompare: postMessage failed", err);
      if (comparing) {
        comparing = false;
        markStuckTiles();
        updateCartProgress("No se pudo conectar — recargá la página y probá de nuevo", 100);
        setTimeout(() => updateCartProgress(null), 2500);
      }
    }
  }

  function connectBackground() {
    try {
      port = chrome.runtime.connect({ name: "compare" });
      port.onMessage.addListener((msg) => {
        if (!msg || typeof msg !== "object") return;

        if (msg.type === "result") {
          applyResult(msg.productId, msg.store, msg.data);
        } else if (msg.type === "batch-done") {
          comparing = false;
          markStuckTiles();
          updateCartProgress("Comparación lista", 100);
          setTimeout(() => updateCartProgress(null), 1200);
        } else if (msg.type === "need-permission") {
          updateCartProgress("Necesitamos tu permiso para consultar Carrefour y Día...", 10);
          sendMessage({ type: "request-permission", items: comparisonItems() });
        } else if (msg.type === "permission") {
          if (!msg.granted) {
            comparing = false;
            markStuckTiles();
            updateCartProgress("Sin permiso — no se pudo comparar", 100);
            setTimeout(() => updateCartProgress(null), 1800);
          }
        }
      });
      port.onDisconnect.addListener(() => {
        port = null;
        if (comparing) {
          comparing = false;
          updateCartProgress("Conexión perdida — volvé a apretar el botón", 100);
          setTimeout(() => updateCartProgress(null), 2000);
        }
      });
    } catch (err) {
      debugLog("priceCompare: connect failed", err);
      port = null;
    }
  }

  function comparisonItems() {
    const items = [];
    itemCache.forEach((item) => {
      if (item.resolved && item.resolved.ean) {
        items.push({ id: item.id, ean: item.resolved.ean });
      }
    });
    return items;
  }

  // =========================================================
  // Scan / init / comparison entry points
  // =========================================================

  async function scanCart() {
    if (!isCartPage()) return;
    if (scanPromise) return scanPromise;

    scanPromise = (async () => {
      try {
        const byId = collectCartItems();

        itemCache.forEach((item, id) => {
          if (!byId.has(id)) itemCache.delete(id);
        });

        byId.forEach((item, id) => {
          const cached = itemCache.get(id);
          if (cached) {
            cached.els = item.els;
            cached.qty = item.qty;
            renderRealPrice(cached);
          } else {
            itemCache.set(id, item);
            renderRealPrice(item);
          }
        });

        renderTotals();

        const pending = [];
        itemCache.forEach((item) => {
          if (!item.resolved && !item.resolving && !item.failed) {
            item.resolving = true;
            pending.push(
              resolveItemData(item).then((resolved) => {
                item.resolved = resolved;
                item.failed = !(resolved && resolved.finalPrice !== null);
                item.resolving = false;
                renderRealPrice(item);
              })
            );
          }
        });

        if (pending.length) {
          await Promise.allSettled(pending);
          renderTotals();
        }
      } finally {
        scanPromise = null;
      }
    })();

    return scanPromise;
  }

  function startComparison() {
    if (!isCartPage()) {
      showNotice("Abrí el carrito para comparar precios");
      return;
    }
    if (comparing) return;
    comparing = true;

    updateCartProgress("Preparando comparación...", 5);
    scanCart().then(() => {
      itemCache.forEach((item) => ensureTiles(item));
      const items = comparisonItems();
      if (!items.length) {
        comparing = false;
        markStuckTiles();
        updateCartProgress("No se pudieron resolver los productos del carrito", 100);
        setTimeout(() => updateCartProgress(null), 2200);
        return;
      }
      updateCartProgress(`Comparando ${items.length} productos...`, 15);
      if (!port) connectBackground();
      sendMessage({ type: "compare", items });
    });
  }

  function init() {
    if (!isCartPage()) return;
    debugLog("priceCompare: cart page detected");

    connectBackground();
    setTimeout(scanCart, 600);

    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scanCart, DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener(
      "change",
      (e) => {
        const t = e.target;
        if (!t || !t.matches || !t.matches("input.form-control-input-text")) return;
        const id = (t.id || "").replace(/^input-/, "");
        const item = id ? itemCache.get(id) : null;
        const qty = parseInt(t.value, 10);
        if (item && qty > 0) item.qty = qty;
        renderTotals();
      },
      true
    );
  }

  return { init, isCartPage, startComparison, showNotice, resolveItemData, pluFromId, pluFromImgSrc, formatMoney, parseMoney };
})();
