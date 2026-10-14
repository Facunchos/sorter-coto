// vistaLigera.js — Generación de vista HTML ligera de productos
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.vistaLigera = (function () {
  "use strict";

  const { resolveBrand, pickPromoLabel, escapeHtmlAttr } = window.CotoSorter.promoUtils;
  const { parseMoneyLoose, resolveDisplayPrices } = window.CotoSorter.priceUtils;

  // ---- Helpers de construcción HTML ----

  function buildCompareHTML(p) {
    const c = p && p.compare;
    const cmpId = p && p.__cmpId;
    if (!c && !cmpId) return "";

    const idAttr = cmpId ? ` data-cmp-id="${escapeHtmlAttr(cmpId)}"` : "";

    const tiles = ["carrefour", "dia"].map((key) => {
      const t = (c && c.tiles && c.tiles[key]) || { status: "pending" };
      const label = key === "carrefour" ? "Carrefour" : "Día";
      const nameCls = key === "carrefour" ? "compare-tile-name-carrefour" : "compare-tile-name-dia";
      const nameHTML = `<span class="compare-tile-name ${nameCls}">${label}</span>`;
      const storeAttr = ` data-store="${key}"`;

      if (t.status !== "ok") {
        const naText = t.status === "pending" ? "…" : "sin datos";
        return `<span class="compare-tile compare-tile-na"${storeAttr}>${nameHTML}<span class="compare-tile-price">${naText}</span></span>`;
      }

      const cls = t.lower === null ? "" : t.lower ? " compare-tile-lower" : " compare-tile-higher";
      const urlAttr = t.url ? ` data-url="${escapeHtmlAttr(t.url)}"` : "";
      const clickable = t.url ? ` onclick="event.preventDefault();event.stopPropagation();window.open(this.dataset.url,'_blank')"` : "";
      const delta = t.deltaText ? `<span class="compare-delta">${escapeHtmlAttr(t.deltaText)}</span>` : "";
      const promo = t.promo ? `<span class="compare-promo">${escapeHtmlAttr(t.promo)}</span>` : "";
      return `<span class="compare-tile${cls}"${storeAttr}${urlAttr}${clickable}>${nameHTML}<span class="compare-tile-price">${t.text}</span>${delta}${promo}</span>`;
    }).join("");

    return `<div class="compare-row"${idAttr}><div class="compare-tiles">${tiles}</div></div>`;
  }

  function escapeText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  let printModeActive = false;

  function buildCardHTML(p, groupUnitType) {
    const rawName = String(p.name || "");
    const safeName = escapeText(rawName);
    const safeUnitType = escapeText(p.unitType || groupUnitType || "");
    const isDobleHoja = /doble\s+hoja/i.test(rawName);
    const safeHref = /^https?:\/\//i.test(String(p.href || "")) ? String(p.href) : "";
    const imgSrc = p.imgSrc ? String(p.imgSrc) : "";

    const imgTag = imgSrc
      ? `<img src="${escapeHtmlAttr(imgSrc)}" alt="" loading="${printModeActive ? "eager" : "lazy"}" onerror="this.style.display='none'">`
      : `<div class="no-img"></div>`;

    const resolved = resolveDisplayPrices(p);

    const priceClass = resolved.hasDiscount ? "price-regular striked" : "price-regular";
    const discountRow = resolved.hasDiscount
      ? `<div class="price-discount">${resolved.promoPriceText}</div>`
      : "";

    const promoLabel = pickPromoLabel(p);
    const brandLabel = resolveBrand(p);
    const promoFilterValue = promoLabel || "Sin oferta";
    const badgesHTML = promoLabel
      ? `<div class="badges"><span class="badge">${promoLabel}</span></div>`
      : "";

    const unitPriceHTML = resolved.unitPriceText
      ? `<div class="unit-price">${resolved.unitPriceText}</div>`
      : "";

    const primaryPriceValue = resolved.hasDiscount
      ? parseMoneyLoose(resolved.promoPriceText)
      : parseMoneyLoose(resolved.regularPriceText);

    const tag = safeHref ? "a" : "div";
    const discountPctValue = resolved.hasDiscount
      ? Math.round((1 - parseMoneyLoose(resolved.promoPriceText) / parseMoneyLoose(resolved.regularPriceText)) * 100)
      : 0;
    const attrs = [
      `class="card-link"`,
      `data-name="${safeName.toLowerCase()}"`,
      `data-unit="${safeUnitType}"`,
      `data-brand="${escapeHtmlAttr(String(brandLabel || "Sin marca").toLowerCase())}"`,
      `data-promo="${escapeHtmlAttr(String(promoFilterValue).toLowerCase())}"`,
      `data-price="${Number.isFinite(primaryPriceValue) && primaryPriceValue > 0 ? primaryPriceValue : ""}"`,
      `data-unit-price="${Number.isFinite(resolved.unitPriceValue) && resolved.unitPriceValue > 0 ? resolved.unitPriceValue : ""}"`,
      `data-discount="${discountPctValue > 0 ? discountPctValue : ""}"`,
      safeHref ? `href="${escapeHtmlAttr(safeHref)}" target="_blank"` : "",
    ].filter(Boolean).join(" ");

    const compareHTML = buildCompareHTML(p);

    return `<${tag} ${attrs}>
  <div class="card${isDobleHoja ? " card-doble-hoja" : ""}">
    <div class="card-img">${imgTag}</div>
    <div class="card-info">
      <div class="card-name">${safeName || "Producto"}</div>
      <div class="card-brand">${escapeText(brandLabel)}</div>
      <div class="${priceClass}">${resolved.regularPriceText}</div>
      ${discountRow}
      ${badgesHTML}
      ${unitPriceHTML}
      ${compareHTML}
    </div>
  </div>
</${tag}>`;
  }

  function buildGroupHTML(group) {
    const count = group.products.length;
    const cardsHTML = group.products.map((p) => buildCardHTML(p, group.unitType)).join("\n");
    return `<section class="group">
  <div class="group-separator" role="button" title="Colapsar/expandir sección">
    <span class="group-label">${group.label}</span>
    <span class="group-count">${count} producto${count !== 1 ? "s" : ""} — ordenados de menor a mayor</span>
    <button class="group-collapse-btn" aria-label="Colapsar sección">&#9660;</button>
  </div>
  <div class="products-grid">
    ${cardsHTML}
  </div>
</section>`;
  }

  // ---- CSS ----

  const STYLES = `
    :root {
      --surface-page: #f8f2ef;
      --surface-page-alt: #fdf9f6;
      --surface-header: rgba(255, 248, 243, 0.94);
      --surface-card: #fffdfb;
      --surface-card-muted: #f7ece7;
      --surface-strong: #fff4ee;
      --border-soft: #efd8cd;
      --border-strong: #d7b4a6;
      --text-main: #2e2622;
      --text-muted: #74665f;
      --accent-main: #de5d49;
      --accent-main-hover: #c84f3d;
      --accent-green: #1f9866;
      --accent-green-soft: #e8f7ef;
      --accent-unit: #2e5d95;
      --shadow-soft: 0 10px 26px rgba(88, 55, 38, 0.08);
      --shadow-card: 0 8px 22px rgba(88, 55, 38, 0.1);
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 9px;
      --motion-fast: 150ms;
      --motion-mid: 240ms;
      --motion-ease: cubic-bezier(0.4, 0, 0.2, 1);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "Poppins", "Nunito Sans", "Trebuchet MS", sans-serif;
      background:
        radial-gradient(circle at 0% 0%, #fff7f1 0%, transparent 46%),
        radial-gradient(circle at 100% 0%, #f6ece7 0%, transparent 42%),
        linear-gradient(180deg, var(--surface-page-alt) 0%, var(--surface-page) 100%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding-bottom: 66px;
    }

    main {
      flex: 1 1 auto;
      padding-bottom: 8px;
    }

    header {
      background: var(--surface-header);
      backdrop-filter: blur(8px);
      color: var(--text-main);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      position: sticky;
      top: 0;
      z-index: 100;
      border-bottom: 1px solid var(--border-soft);
      box-shadow: 0 6px 24px rgba(88, 55, 38, 0.08);
      flex-wrap: wrap;
      animation: headerFadeIn var(--motion-mid) var(--motion-ease);
    }

    header h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.7px;
      color: #5d3f35;
      white-space: nowrap;
      margin-right: 4px;
    }

    .header-date {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      margin-left: auto;
    }

    .search-wrap {
      flex: 1 1 320px;
      min-width: 230px;
      max-width: 460px;
      position: relative;
      order: 1;
    }

    .search-wrap::before {
      content: "⌕";
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #8b6f63;
      font-size: 14px;
      pointer-events: none;
    }

    .search-wrap input {
      width: 100%;
      padding: 9px 34px 9px 30px;
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      font-size: 13px;
      outline: none;
      background: #fff;
      color: var(--text-main);
      -webkit-appearance: none;
      transition: border-color var(--motion-fast) var(--motion-ease), box-shadow var(--motion-fast) var(--motion-ease);
    }

    .search-wrap input::placeholder { color: #967b70; }

    .search-wrap input:focus {
      border-color: var(--border-strong);
      box-shadow: 0 0 0 3px rgba(222, 93, 73, 0.16);
    }

    .search-clear {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #8f7368;
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
      display: none;
      padding: 2px;
      transition: color var(--motion-fast) var(--motion-ease);
    }

    .search-clear:hover { color: #5f4a42; }
    .search-clear.visible { display: block; }

    .search-count {
      font-size: 11px;
      color: #7f6d65;
      white-space: nowrap;
      min-width: 86px;
      text-align: right;
      order: 6;
    }

    .unit-filter-wrap {
      min-width: 170px;
      max-width: 230px;
      order: 2;
    }

    .unit-filter {
      width: 100%;
      padding: 8px 11px;
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      outline: none;
      background: #fff;
      color: var(--text-main);
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      transition: border-color var(--motion-fast) var(--motion-ease), box-shadow var(--motion-fast) var(--motion-ease);
    }

    .unit-filter:focus {
      border-color: var(--border-strong);
      box-shadow: 0 0 0 3px rgba(222, 93, 73, 0.14);
    }

    .unit-filter option { color: var(--text-main); }

    .range-filter-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 320px;
      flex-wrap: wrap;
      order: 3;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--surface-strong);
      border: 1px solid var(--border-soft);
      flex: 1 1 320px;
    }

    .filters-row {
      order: 4;
      display: flex;
      align-items: stretch;
      gap: 10px;
      flex: 1 1 100%;
      flex-wrap: nowrap;
    }

    .range-filter-wrap input[type="number"] {
      width: 92px;
      padding: 7px 8px;
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      outline: none;
      background: #fff;
      color: var(--text-main);
      font-size: 12px;
      transition: border-color var(--motion-fast) var(--motion-ease), box-shadow var(--motion-fast) var(--motion-ease);
    }

    .range-filter-wrap input[type="number"]::placeholder { color: #9f8a80; }

    .range-filter-wrap input[type="number"]:focus {
      border-color: var(--border-strong);
      box-shadow: 0 0 0 2px rgba(222, 93, 73, 0.12);
    }

    .range-filter-wrap .range-sep {
      color: #8c7468;
      font-size: 12px;
      font-weight: 600;
    }

    .range-toggle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: #6e5d56;
      font-weight: 600;
      user-select: none;
    }

    .range-toggle input { accent-color: var(--accent-main); }

    .multi-filter {
      min-width: 180px;
      max-width: 240px;
      border-radius: var(--radius-md);
      background: #fff;
      border: 1px solid var(--border-soft);
      overflow: visible;
      box-shadow: 0 3px 10px rgba(88, 55, 38, 0.06);
      order: 3;
      position: relative;
      flex: 0 0 220px;
    }

    .multi-filter summary {
      list-style: none;
      cursor: pointer;
      padding: 9px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #594740;
      background: #fffaf7;
      border-radius: var(--radius-md);
    }

    .multi-filter summary::-webkit-details-marker { display: none; }

    .multi-panel {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      right: 0;
      background: #fff;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      box-shadow: 0 12px 28px rgba(88, 55, 38, 0.14);
      padding: 8px;
      z-index: 220;
      animation: panelIn var(--motion-fast) var(--motion-ease);
    }

    .multi-filter[open] .multi-panel { display: block; }

    .multi-options {
      max-height: 172px;
      overflow: auto;
      padding: 0 4px 2px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .multi-search-wrap { padding: 0 4px 8px; }

    .multi-search-input {
      width: 100%;
      border: 1px solid var(--border-soft);
      border-radius: 9px;
      padding: 7px 8px;
      outline: none;
      background: #fff;
      color: var(--text-main);
      font-size: 12px;
      -webkit-appearance: none;
    }

    .multi-search-input::placeholder { color: #947a70; }

    .multi-search-input:focus {
      border-color: var(--border-strong);
      box-shadow: 0 0 0 2px rgba(222, 93, 73, 0.12);
    }

    .multi-option {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 3px 0;
      color: #63524b;
      user-select: none;
      transition: color var(--motion-fast) var(--motion-ease);
    }

    .multi-option input {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border: 1.5px solid #cbaea1;
      border-radius: 5px;
      background: #fff;
      display: inline-grid;
      place-content: center;
      cursor: pointer;
      transition: border-color var(--motion-fast) var(--motion-ease), background var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease);
    }

    .multi-option input::before {
      content: "";
      width: 8px;
      height: 8px;
      transform: scale(0);
      transform-origin: center;
      transition: transform var(--motion-fast) var(--motion-ease);
      clip-path: polygon(14% 45%, 0 59%, 42% 100%, 100% 23%, 86% 10%, 40% 66%);
      background: #fff;
    }

    .multi-option input:hover {
      border-color: #b89486;
      transform: translateY(-1px);
    }

    .multi-option input:checked {
      background: linear-gradient(180deg, #ea765f 0%, #d75d48 100%);
      border-color: #cc5844;
      box-shadow: 0 1px 4px rgba(173, 73, 56, 0.25);
    }

    .multi-option input:checked::before {
      transform: scale(1);
    }

    .multi-option input:focus-visible {
      outline: 2px solid rgba(222, 93, 73, 0.35);
      outline-offset: 1px;
    }
    .multi-option.hidden-option { display: none; }

    .multi-option.available-brand {
      color: var(--accent-green);
      font-weight: 700;
    }

    .group {
      margin: 0 0 40px;
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-soft);
      background: rgba(255, 255, 255, 0.52);
    }

    .group.empty { display: none; }

    .group-separator {
      background: #fff8f3;
      color: var(--text-main);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: pointer;
      user-select: none;
      border-left: 5px solid var(--accent-main);
      transition: background var(--motion-fast) var(--motion-ease);
    }

    .group-separator:hover { background: #fff1ea; }

    .group-label {
      font-size: 24px;
      font-weight: 700;
      color: #4b3630;
    }

    .group-count {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
      flex: 1;
    }

    .group-collapse-btn {
      background: none;
      border: none;
      color: #7a6258;
      font-size: 18px;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      transition: transform var(--motion-mid) var(--motion-ease), color var(--motion-fast) var(--motion-ease);
      flex-shrink: 0;
    }

    .group-collapse-btn:hover { color: var(--accent-main); }
    .group.collapsed .group-collapse-btn { transform: rotate(-90deg); }

    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      padding: 18px 20px;
      overflow: hidden;
      transition: max-height var(--motion-mid) var(--motion-ease), padding var(--motion-mid) var(--motion-ease);
      max-height: 999999px;
    }

    .group.collapsed .products-grid {
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    .card-link {
      text-decoration: none;
      color: inherit;
      display: block;
      animation: cardEnter 260ms var(--motion-ease);
      transform-origin: center top;
    }

    .card-link.hidden { display: none; }

    .card {
      background: var(--surface-card);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-md);
      overflow: hidden;
      transition:
        box-shadow var(--motion-fast) var(--motion-ease),
        transform var(--motion-fast) var(--motion-ease),
        border-color var(--motion-fast) var(--motion-ease);
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .card.card-doble-hoja { background: #e6f0fd; }

    .card-link:hover .card {
      box-shadow: var(--shadow-card);
      transform: translateY(-2px);
      border-color: #d8b2a1;
    }

    .card-img {
      width: 100%;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #fffcfa 0%, #f6efea 100%);
      border-bottom: 1px solid var(--border-soft);
      overflow: hidden;
    }

    .card-img img {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08));
    }

    .no-img { width: 100%; aspect-ratio: 1; background: #f3ebe7; }

    .card-info {
      padding: 10px 11px 11px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      flex: 1;
    }

    .card-name {
      font-size: 12px;
      font-weight: 700;
      line-height: 1.38;
      color: #3f312c;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-brand {
      font-size: 10px;
      color: #7f6c64;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .price-regular {
      font-size: 15px;
      font-weight: 700;
      color: #b94a3a;
    }

    .price-regular.striked {
      color: #b4a39b;
      text-decoration: line-through;
      font-weight: 500;
      font-size: 12px;
    }

    .price-discount {
      font-size: 16px;
      font-weight: 700;
      color: var(--accent-green);
    }

    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 2px;
    }

    .badge {
      background: linear-gradient(180deg, #ea765f 0%, #d75d48 100%);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
      box-shadow: 0 1px 5px rgba(173, 73, 56, 0.25);
    }

    .unit-price {
      font-size: 11px;
      font-weight: 700;
      color: var(--accent-unit);
      margin-top: auto;
      padding: 4px 6px;
      border-radius: 8px;
      background: var(--accent-green-soft);
      border: 1px solid #c8ead7;
    }

    .compare-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 6px;
    }

    .compare-tiles {
      display: flex;
      gap: 4px;
      flex-wrap: nowrap;
      align-items: stretch;
    }

    .compare-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex: 1 1 0;
      min-width: 0;
      padding: 4px 4px;
      border: 1.5px solid #ccc;
      border-radius: 6px;
      background: #fafafa;
      cursor: default;
      color: inherit;
      overflow: hidden;
    }

    .compare-tile-name {
      font-size: 9px;
      font-weight: 700;
      color: #fff;
      border-radius: 3px;
      padding: 1px 6px;
    }

    .compare-tile-name-carrefour { background: #0b4ea2; }
    .compare-tile-name-dia { background: #e20018; }

    .compare-tile-price {
      font-size: 12px;
      font-weight: 700;
      color: #333;
    }

    .compare-tile-lower {
      border-color: #2e7d32;
      background: #eafaef;
      cursor: pointer;
    }

    .compare-tile-lower .compare-tile-price { color: #2e7d32; }

    .compare-tile-higher {
      border-color: #e20025;
      background: #fdeef0;
      cursor: pointer;
    }

    .compare-tile-higher .compare-tile-price { color: #e20025; }

    .compare-tile-na .compare-tile-price {
      color: #999;
      font-weight: 500;
    }

    .compare-promo {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      background: #f7c948;
      color: #333;
    }

    .compare-btn {
      border: none;
      border-radius: 8px;
      background: #e20025;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
      white-space: nowrap;
    }

    .compare-btn:hover { background: #b8001d; }

    .compare-delta {
      font-size: 9px;
      font-weight: 700;
      color: #555;
      white-space: nowrap;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cmp-toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #6f5f57;
      cursor: pointer;
      white-space: nowrap;
    }

    @keyframes cardEnter {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes headerFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes panelIn {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .vista-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 10px 16px 12px;
      color: #6f5f57;
      font-size: 12px;
      font-weight: 500;
      flex-wrap: wrap;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 260;
      background: rgba(255, 248, 243, 0.96);
      backdrop-filter: blur(6px);
      border-top: 1px solid var(--border-soft);
      box-shadow: 0 -6px 16px rgba(88, 55, 38, 0.08);
      width: 100%;
    }

    .footer-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      color: #5f4f48;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      background: #fffaf7;
      transition: color var(--motion-fast) var(--motion-ease), background var(--motion-fast) var(--motion-ease);
    }

    .footer-link:hover {
      color: var(--accent-main);
      background: #fff1ea;
    }

    .footer-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      background: #7a655b;
      letter-spacing: 0.2px;
      text-transform: uppercase;
    }

    .footer-link.github .footer-icon { background: #2e2e2e; }
    .footer-link.linkedin .footer-icon { background: #0a66c2; }

    @media (max-width: 1180px) {
      header { gap: 10px; }
      .header-date { order: 7; width: 100%; margin-left: 0; }
      .search-wrap { flex-basis: 100%; max-width: none; }
      .filters-row { flex-wrap: wrap; }
      .range-filter-wrap { min-width: 280px; }
      .multi-filter { max-width: none; flex: 1 1 210px; }
    }

    @media (max-width: 760px) {
      header {
        padding: 12px;
        gap: 8px;
      }

      header h1 {
        font-size: 18px;
        width: 100%;
      }

      .unit-filter-wrap,
      .range-filter-wrap,
      .filters-row,
      .multi-filter {
        width: 100%;
        max-width: none;
      }

      .filters-row {
        flex-direction: column;
        gap: 8px;
      }

      .multi-panel {
        position: static;
        box-shadow: none;
        border: 1px solid var(--border-soft);
        margin-top: 4px;
      }

      .range-filter-wrap {
        justify-content: space-between;
      }

      .range-filter-wrap input[type="number"] {
        width: calc(50% - 18px);
      }

      .products-grid {
        grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
        padding: 14px 12px;
        gap: 12px;
      }

      .group {
        margin-bottom: 24px;
        border-radius: 12px;
      }

      .group-separator {
        padding: 12px;
      }

      .group-label {
        font-size: 20px;
      }

      body { padding-bottom: 78px; }

      .vista-footer {
        gap: 8px;
        padding: 8px 10px 10px;
        font-size: 11px;
      }
    }

    @media print {
      body { background: #fff; padding-bottom: 0; }
      header {
        position: static;
        box-shadow: none;
        background: #fff;
        color: #000;
        border-bottom: 2px solid #cf5b45;
      }
      .search-wrap, .search-count, .group-collapse-btn { display: none !important; }
      .unit-filter-wrap { display: none !important; }
      .filters-row, .range-filter-wrap, .multi-filter, .vista-footer { display: none !important; }
      .compare-btn, .cmp-toggle, #sort-select { display: none !important; }
      .group {
        margin-bottom: 16px;
        box-shadow: none;
        border-radius: 0;
        background: #fff;
      }
      .group-separator {
        background: #fff;
        color: #000;
        border-top: 1px solid #cf5b45;
        border-bottom: 1px solid #cf5b45;
        border-left: none;
      }
      .products-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        padding: 10px 12px;
      }
      .card { break-inside: avoid; page-break-inside: avoid; box-shadow: none; }
      .card-link:hover .card { box-shadow: none; transform: none; border-color: #e8e8e8; }
      @page { size: A4 landscape; margin: 8mm; }
    }
  `;

  // ---- Script de búsqueda (se embebe como texto en el HTML final) ----

  const SEARCH_SCRIPT = `
    (function () {
      var input   = document.getElementById('search-input');
      var unitSelect = document.getElementById('unit-filter');
      var priceMinInput = document.getElementById('price-min');
      var priceMaxInput = document.getElementById('price-max');
      var rangeUseUnit = document.getElementById('range-use-unit');
      var brandOptions = document.getElementById('brand-options');
      var brandSearchInput = document.getElementById('brand-search-input');
      var promoOptions = document.getElementById('promo-options');
      var brandFilter = document.getElementById('brand-filter');
      var promoFilter = document.getElementById('promo-filter');
      var clearBtn = document.getElementById('search-clear');
      var countEl = document.getElementById('search-count');
      var cmpOnlyInput = document.getElementById('cmp-only');
      var sortSelect = document.getElementById('sort-select');
      var cmpSortBest = document.getElementById('cmp-sort-best');
      var cards   = Array.from(document.querySelectorAll('.card-link'));
      var groups  = Array.from(document.querySelectorAll('.group'));

      function updateGroup(group) {
        var visible = group.querySelectorAll('.card-link:not(.hidden)').length;
        group.classList.toggle('empty', visible === 0);
        var span = group.querySelector('.group-count');
        if (!span) return;
        if (!span.dataset.orig) span.dataset.orig = span.textContent;
        var total = parseInt(span.dataset.orig);
        span.textContent = visible === total
          ? span.dataset.orig
          : visible + ' de ' + span.dataset.orig;
      }

      function buildMultiOptions(container, values, prefix) {
        container.innerHTML = '';
        values.forEach(function (value, idx) {
          var label = document.createElement('label');
          label.className = 'multi-option';

          var input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = false;
          input.value = value;
          input.id = prefix + '-' + idx;

          var text = document.createElement('span');
          text.textContent = value;

          label.appendChild(input);
          label.appendChild(text);
          container.appendChild(label);
        });
      }

      function getCheckedValues(container) {
        return new Set(Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(function (x) {
          return String(x.value || '').toLowerCase();
        }));
      }

      function normalizeForSearch(text) {
        return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      }

      function filterBrandOptions(queryText, allowedBrands, onlyAllowedBrands) {
        if (!brandOptions) return;
        var term = normalizeForSearch(queryText).trim();
        var allowed = allowedBrands instanceof Set ? allowedBrands : null;
        var onlyAllowed = !!onlyAllowedBrands;

        Array.from(brandOptions.querySelectorAll('.multi-option')).forEach(function (option) {
          var input = option.querySelector('input[type="checkbox"]');
          var valueRaw = input ? String(input.value || '').toLowerCase() : '';
          var value = input ? normalizeForSearch(input.value) : '';
          var matchSearch = !term || value.includes(term);
          var matchAllowed = !onlyAllowed || (allowed && allowed.has(valueRaw));
          option.classList.toggle('hidden-option', !(matchSearch && matchAllowed));
        });
      }

      function updateAvailableBrandHighlight(isOfertaFilterActive, allowedBrandSet) {
        if (!brandOptions) return;

        var options = Array.from(brandOptions.querySelectorAll('.multi-option'));
        options.forEach(function (option) {
          var input = option.querySelector('input[type="checkbox"]');
          var value = input ? String(input.value || '').toLowerCase() : '';
          var isVisibleBrand = isOfertaFilterActive && allowedBrandSet.has(value);

          option.classList.toggle('available-brand', isVisibleBrand);
        });

        options.sort(function (a, b) {
          var aInput = a.querySelector('input[type="checkbox"]');
          var bInput = b.querySelector('input[type="checkbox"]');
          var aValue = aInput ? String(aInput.value || '') : '';
          var bValue = bInput ? String(bInput.value || '') : '';

          if (isOfertaFilterActive) {
            var aTop = a.classList.contains('available-brand') ? 0 : 1;
            var bTop = b.classList.contains('available-brand') ? 0 : 1;
            if (aTop !== bTop) return aTop - bTop;
          }

          return aValue.localeCompare(bValue, 'es', { sensitivity: 'base' });
        });

        options.forEach(function (option) {
          brandOptions.appendChild(option);
        });
      }

      function getAllowedBrandsFromPromos(selectedPromos) {
        if (!(selectedPromos instanceof Set) || selectedPromos.size === 0) return null;
        var allowed = new Set();

        cards.forEach(function (card) {
          var promo = (card.dataset.promo || '').toLowerCase();
          var brand = (card.dataset.brand || '').toLowerCase();
          if (selectedPromos.has(promo) && brand) {
            allowed.add(brand);
          }
        });

        return allowed;
      }

      function enforceAllowedBrandSelection(allowedBrands, onlyAllowedBrands) {
        if (!brandOptions || !onlyAllowedBrands || !(allowedBrands instanceof Set)) return;
        Array.from(brandOptions.querySelectorAll('input[type="checkbox"]')).forEach(function (input) {
          var value = String(input.value || '').toLowerCase();
          if (input.checked && !allowedBrands.has(value)) {
            input.checked = false;
          }
        });
      }

      function filter(q, selectedUnit) {
        var normalizedTerm = normalizeForSearch(q).trim();
        var selected = selectedUnit || '';
        var useUnitRange = !!(rangeUseUnit && rangeUseUnit.checked);
        var minVal = parseFloat(priceMinInput && priceMinInput.value);
        var maxVal = parseFloat(priceMaxInput && priceMaxInput.value);
        var hasMin = Number.isFinite(minVal);
        var hasMax = Number.isFinite(maxVal);
        if (hasMin && hasMax && minVal > maxVal) { var tmp = minVal; minVal = maxVal; maxVal = tmp; }
        var selectedPromos = getCheckedValues(promoOptions);
        var onlyAllowedBrands = selectedPromos.size > 0;
        var allowedBrands = getAllowedBrandsFromPromos(selectedPromos);

        enforceAllowedBrandSelection(allowedBrands, onlyAllowedBrands);

        var selectedBrands = getCheckedValues(brandOptions);
        var visibleCount = 0;
        var onlyCmp = !!(cmpOnlyInput && cmpOnlyInput.checked);
        var hasFilter = !!(normalizedTerm || selected || hasMin || hasMax || selectedBrands.size > 0 || selectedPromos.size > 0 || onlyCmp);

        cards.forEach(function (card) {
          var name = normalizeForSearch(card.dataset.name || '');
          var unit = card.dataset.unit || '';
          var brand = (card.dataset.brand || '').toLowerCase();
          var promo = (card.dataset.promo || '').toLowerCase();

          var priceField = useUnitRange ? card.dataset.unitPrice : card.dataset.price;
          var priceValue = parseFloat(priceField || '');

          var matchName = !normalizedTerm || name.includes(normalizedTerm);
          var matchUnit = !selected || unit === selected;
          var matchBrand = selectedBrands.size === 0 ? true : selectedBrands.has(brand);
          var matchPromo = selectedPromos.size === 0 ? true : selectedPromos.has(promo);

          var matchRange = true;
          if (hasMin || hasMax) {
            if (!Number.isFinite(priceValue)) {
              matchRange = false;
            } else {
              if (hasMin && priceValue < minVal) matchRange = false;
              if (hasMax && priceValue > maxVal) matchRange = false;
            }
          }

          var matchCmp = !onlyCmp || card.dataset.cmpBest === '1';
          var match = matchName && matchUnit && matchBrand && matchPromo && matchRange && matchCmp;
          card.classList.toggle('hidden', !match);
          if (match) {
            visibleCount++;
          }
        });
        groups.forEach(updateGroup);
        updateAvailableBrandHighlight(onlyAllowedBrands, allowedBrands || new Set());
        filterBrandOptions(brandSearchInput ? brandSearchInput.value : '', allowedBrands, onlyAllowedBrands);
        clearBtn.classList.toggle('visible', !!normalizedTerm);
        countEl.textContent = hasFilter
          ? visibleCount + ' resultado' + (visibleCount !== 1 ? 's' : '')
          : '';
      }

      var brands = Array.from(new Set(cards.map(function (c) {
        return String(c.dataset.brand || '').trim();
      }).filter(Boolean))).sort(function (a, b) {
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
      });

      var promos = Array.from(new Set(cards.map(function (c) {
        return String(c.dataset.promo || '').trim();
      }).filter(Boolean))).sort(function (a, b) {
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
      });

      buildMultiOptions(brandOptions, brands, 'brand-opt');
      buildMultiOptions(promoOptions, promos, 'promo-opt');

      if (brandFilter && brands.length === 0) brandFilter.style.display = 'none';
      if (promoFilter && promos.length === 0) promoFilter.style.display = 'none';

      var debounceTimer = null;
      function applyFilter(save) {
        filter(input.value, unitSelect.value);
        if (save !== false) saveState();
      }
      function scheduleFilter() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () { applyFilter(); }, 120);
      }
      function sortCards() {
        var sel = sortSelect ? sortSelect.value : 'default';
        var mode = (cmpSortBest && cmpSortBest.checked)
          ? 'best-comp'
          : (sel === 'default' ? 'orig' : sel);
        Array.from(document.querySelectorAll('.products-grid')).forEach(function (grid) {
          var items = Array.from(grid.querySelectorAll('.card-link'));
          items.sort(function (a, b) {
            if (mode === 'orig') {
              return (parseFloat(a.dataset.sortIndex) || 0) - (parseFloat(b.dataset.sortIndex) || 0);
            }
            if (mode === 'best-comp') {
              // $/X recalculado con el precio más bajo de la competencia:
              // unitPrice * (mejorPrecioCompetencia / precioCoto) = mejorPrecio / cantidad.
              var au = parseFloat(a.dataset.unitPrice);
              var bu = parseFloat(b.dataset.unitPrice);
              var ac = parseFloat(a.dataset.cmpBestPrice);
              var bc = parseFloat(b.dataset.cmpBestPrice);
              var apv = parseFloat(a.dataset.price);
              var bpv = parseFloat(b.dataset.price);
              var av = (isFinite(au) && isFinite(ac) && isFinite(apv) && apv > 0) ? au * (ac / apv) : Infinity;
              var bv = (isFinite(bu) && isFinite(bc) && isFinite(bpv) && bpv > 0) ? bu * (bc / bpv) : Infinity;
              if (av === bv) return 0;
              return av < bv ? -1 : 1;
            }
            if (mode === 'discount') {
              return (parseFloat(b.dataset.discount) || 0) - (parseFloat(a.dataset.discount) || 0);
            }
            if (mode === 'delta') {
              var av = parseFloat(a.dataset.cmpDelta);
              var bv = parseFloat(b.dataset.cmpDelta);
              if (!isFinite(av) && !isFinite(bv)) return 0;
              if (!isFinite(av)) return 1;
              if (!isFinite(bv)) return -1;
              return av - bv;
            }
            if (mode === 'price-desc') {
              return (parseFloat(b.dataset.price) || 0) - (parseFloat(a.dataset.price) || 0);
            }
            var au = parseFloat(a.dataset.unitPrice);
            var bu = parseFloat(b.dataset.unitPrice);
            if (!isFinite(au) && !isFinite(bu)) return 0;
            if (!isFinite(au)) return 1;
            if (!isFinite(bu)) return -1;
            return au - bu;
          });
          items.forEach(function (el) { grid.appendChild(el); });
        });
      }
      function saveState() {
        try {
          localStorage.setItem('coto-vl-filters-v1', JSON.stringify({
            q: input.value,
            unit: unitSelect ? unitSelect.value : '',
            min: priceMinInput ? priceMinInput.value : '',
            max: priceMaxInput ? priceMaxInput.value : '',
            useUnit: rangeUseUnit ? rangeUseUnit.checked : false,
            cmp: cmpOnlyInput ? cmpOnlyInput.checked : false,
            brands: brandOptions ? Array.from(brandOptions.querySelectorAll('input:checked')).map(function (x) { return x.value; }) : [],
            promos: promoOptions ? Array.from(promoOptions.querySelectorAll('input:checked')).map(function (x) { return x.value; }) : [],
          }));
        } catch (e) {}
      }
      function setChecked(container, values) {
        if (!container) return;
        Array.from(container.querySelectorAll('input[type="checkbox"]')).forEach(function (x) {
          x.checked = values.indexOf(x.value) >= 0;
        });
      }
      function restoreState() {
        try {
          var s = JSON.parse(localStorage.getItem('coto-vl-filters-v1') || 'null');
          if (!s) return;
          input.value = s.q || '';
          if (unitSelect) unitSelect.value = s.unit || '';
          if (priceMinInput) priceMinInput.value = s.min || '';
          if (priceMaxInput) priceMaxInput.value = s.max || '';
          if (rangeUseUnit) rangeUseUnit.checked = !!s.useUnit;
          if (cmpOnlyInput) cmpOnlyInput.checked = !!s.cmp;
          setChecked(brandOptions, s.brands || []);
          setChecked(promoOptions, s.promos || []);
        } catch (e) {}
      }

      input.addEventListener('input', scheduleFilter);
      unitSelect.addEventListener('change', function () { applyFilter(); });
      clearBtn.addEventListener('click', function () { input.value = ''; input.focus(); applyFilter(); });
      if (priceMinInput) priceMinInput.addEventListener('input', scheduleFilter);
      if (priceMaxInput) priceMaxInput.addEventListener('input', scheduleFilter);
      if (rangeUseUnit) rangeUseUnit.addEventListener('change', function () { applyFilter(); });
      if (brandOptions) brandOptions.addEventListener('change', function () { applyFilter(); });
      if (cmpOnlyInput) cmpOnlyInput.addEventListener('change', function () { applyFilter(); });
      if (cmpSortBest) cmpSortBest.addEventListener('change', function () { sortCards(); saveState(); });
      if (sortSelect) sortSelect.addEventListener('change', function () { sortCards(); saveState(); });

      document.addEventListener('cmp-updated', function () {
        if (cmpSortBest && cmpSortBest.checked) sortCards();
      });

      document.addEventListener('keydown', function (e) {
        var t = e.target;
        var typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
        if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
        else if (e.key === 'Escape') {
          if (typing && t.blur) t.blur();
          input.value = '';
          applyFilter();
        }
      });

      cards.forEach(function (card, idx) { card.dataset.sortIndex = String(idx); });

      restoreState();
      applyFilter(false);
      if (brandSearchInput) brandSearchInput.addEventListener('input', function () { filter(input.value, unitSelect.value); });
      if (promoOptions) promoOptions.addEventListener('change', function () { filter(input.value, unitSelect.value); });

      filterBrandOptions('', null, false);
      filter('', unitSelect.value);

      // ---- Colapso de grupos ----
      document.querySelectorAll('.group-separator').forEach(function (sep) {
        sep.addEventListener('click', function () {
          sep.closest('.group').classList.toggle('collapsed');
        });
      });
    })();
  `;

  function buildDocumentHTML({ title, printMode, dateStr, sectionsHTML, autoPrint }) {
    return [
      "<!DOCTYPE html>",
      '<html lang="es">',
      "<head>",
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      "  <title>" + title + "</title>",
      "  <style>" + STYLES + "  </style>",
      "</head>",
      "<body>",
      "  <header>",
      "    <h1>" + (printMode ? "COTO — Revista Promos" : "COTO — Vista Ligera") + "</h1>",
      '    <div class="search-wrap">',
      '      <input type="text" id="search-input" placeholder="Buscar producto\u2026" autocomplete="off" spellcheck="false">',
      '      <button class="search-clear" id="search-clear" title="Limpiar b\u00fasqueda">\u2715</button>',
      "    </div>",
      '    <div class="unit-filter-wrap">',
      '      <select id="unit-filter" class="unit-filter" title="Filtrar por tipo de unidad">',
      '        <option value="">Tipo de unidad</option>',
      '        <option value="weight">$/Kg</option>',
      '        <option value="volume">$/L</option>',
      '        <option value="100g">$/100g</option>',
      '        <option value="square">$/m²</option>',
      '        <option value="unit">$/Unidad</option>',
      '      </select>',
      '    </div>',
      '    <div class="filters-row">',
      '    <div class="range-filter-wrap">',
      '      <input type="number" id="price-min" placeholder="Desde" min="0" step="0.01" title="Precio m\u00ednimo">',
      '      <span class="range-sep">-</span>',
      '      <input type="number" id="price-max" placeholder="Hasta" min="0" step="0.01" title="Precio m\u00e1ximo">',
      '      <label class="range-toggle" title="Usar $/X para el rango">',
      '        <input type="checkbox" id="range-use-unit">',
      '        <span>$/X</span>',
      '      </label>',
      '    </div>',
      '    <details class="multi-filter" id="brand-filter">',
      '      <summary>Marcas</summary>',
      '      <div class="multi-panel">',
      '        <div class="multi-search-wrap">',
      '          <input type="text" id="brand-search-input" class="multi-search-input" placeholder="Buscar marca..." autocomplete="off" spellcheck="false">',
      '        </div>',
      '        <div class="multi-options" id="brand-options"></div>',
      '      </div>',
      '    </details>',
      '    <details class="multi-filter" id="promo-filter">',
      '      <summary>Ofertas</summary>',
      '      <div class="multi-panel">',
      '        <div class="multi-options" id="promo-options"></div>',
      '      </div>',
      '    </details>',
      '    </div>',
      printMode ? "" : '    <button class="compare-btn" id="vl-compare-btn" title="Comparar precios con la competencia">Comparar con competencia</button>',
      printMode ? "" : '    <label class="cmp-toggle" title="Mostrar solo productos donde la competencia es más barata"><input type="checkbox" id="cmp-only">Solo donde gana la competencia</label>',
      printMode ? "" : '    <select id="sort-select" class="unit-filter" title="Ordenar tarjetas"><option value="default">Ordenar</option><option value="unit">$/X \u2191</option><option value="price-desc">Precio \u2193</option><option value="discount">% descuento</option><option value="delta">Delta competencia</option></select>',
      printMode ? "" : '    <label class="cmp-toggle" title="Ordenar las tarjetas por el mejor precio entre Carrefour y Día"><input type="checkbox" id="cmp-sort-best">Ordenar por mejor precio de todas las competencias</label>',
      '    <span class="search-count" id="search-count"></span>',
      '    <span class="header-date">' + dateStr + "</span>",
      "  </header>",
      "  <main>",
      sectionsHTML,
      "  </main>",
      '  <footer class="vista-footer">',
      '    <span>Hecho por Facundo Martinez</span>',
      '    <a class="footer-link github" href="https://github.com/Facunchos" target="_blank" rel="noopener noreferrer" title="GitHub de Facundo">',
      '      <span class="footer-icon">GH</span><span>GitHub</span>',
      '    </a>',
      '    <a class="footer-link linkedin" href="https://www.linkedin.com/in/facunmartinez/" target="_blank" rel="noopener noreferrer" title="LinkedIn de Facundo">',
      '      <span class="footer-icon">in</span><span>LinkedIn</span>',
      '    </a>',
      '  </footer>',
      autoPrint ? "  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });</" + "script>" : "",
      "  <script>" + SEARCH_SCRIPT + "</" + "script>",
      "</body>",
      "</html>",
    ].join("\n");
  }

  // ---- Generación principal ----

  /**
   * Construye el documento HTML completo y lo abre en una nueva pestaña.
   * No descarga archivos; usa un Blob URL que el navegador resuelve en memoria.
   * @param {object[]} products — lista de productos ya scrapeados
   */
  function generateRevistaHTML(products, options) {
    const opts = options || {};
    const title = opts.title || "Vista Ligera — COTO Promos";
    const printMode = !!opts.printMode;
    const autoPrint = !!opts.autoPrint;

    const { groupAndSortProducts } = window.CotoSorter.revista;
    const groups = groupAndSortProducts(products);

    const dateStr = new Date().toLocaleDateString("es-AR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    printModeActive = printMode;

    for (const group of groups) {
      const decorated = group.products.map((p) => {
        const u = resolveDisplayPrices(p).unitPriceValue;
        const pr = Number(p?.activePrice);
        return {
          p,
          unit: Number.isFinite(u) ? u : Infinity,
          price: Number.isFinite(pr) ? pr : Infinity,
        };
      });
      decorated.sort((a, b) => {
        const av = group.unitType ? a.unit : a.price;
        const bv = group.unitType ? b.unit : b.price;
        if (av === bv) return 0;
        return av < bv ? -1 : 1;
      });
      group.products = decorated.map((d) => d.p);
    }

    const sectionsHTML = groups.map(buildGroupHTML).join("\n");

    const html = buildDocumentHTML({
      title,
      printMode,
      dateStr,
      sectionsHTML,
      autoPrint,
    });

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, "_blank");
    if (!win) {
      alert("El navegador bloqueó la pestaña de Vista Ligera. Permití las ventanas emergentes para este sitio y volvé a intentar.");
      URL.revokeObjectURL(blobUrl);
      return null;
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    return win;
  }

  return { generateRevistaHTML };
})();
