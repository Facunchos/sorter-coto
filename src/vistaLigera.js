// vistaLigera.js — Generación de vista HTML ligera de productos
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.vistaLigera = (function () {
  "use strict";

  const { resolveBrand, pickPromoLabel, escapeHtmlAttr } = window.CotoSorter.promoUtils;
  const { parseMoneyLoose, resolveDisplayPrices } = window.CotoSorter.priceUtils;

  // ---- Helpers de construcción HTML ----

  function buildCardHTML(p, groupUnitType) {
    const safeName = (p.name || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const safeUnitType = (p.unitType || groupUnitType || "").toString();
    const isDobleHoja = /doble\s+hoja/i.test(p.name || "");

    const imgTag = p.imgSrc
      ? `<img src="${p.imgSrc}" alt="" loading="lazy" onerror="this.style.display='none'">`
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

    const tag = p.href ? "a" : "div";
    const attrs = [
      `class="card-link"`,
      `data-name="${safeName.toLowerCase()}"`,
      `data-unit="${safeUnitType}"`,
      `data-brand="${escapeHtmlAttr(String(brandLabel || "Sin marca").toLowerCase())}"`,
      `data-promo="${escapeHtmlAttr(String(promoFilterValue).toLowerCase())}"`,
      `data-price="${Number.isFinite(primaryPriceValue) && primaryPriceValue > 0 ? primaryPriceValue : ""}"`,
      `data-unit-price="${Number.isFinite(resolved.unitPriceValue) && resolved.unitPriceValue > 0 ? resolved.unitPriceValue : ""}"`,
      p.href ? `href="${p.href}" target="_blank"` : "",
    ].filter(Boolean).join(" ");

    return `<${tag} ${attrs}>
  <div class="card${isDobleHoja ? " card-doble-hoja" : ""}">
    <div class="card-img">${imgTag}</div>
    <div class="card-info">
      <div class="card-name">${p.name || "Producto"}</div>
      <div class="card-brand">${brandLabel}</div>
      <div class="${priceClass}">${resolved.regularPriceText}</div>
      ${discountRow}
      ${badgesHTML}
      ${unitPriceHTML}
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
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f4f4f4;
      color: #222;
    }

    /* ---- Header ---- */
    header {
      background: #e20025;
      color: #fff;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
      flex-wrap: wrap;
    }
    header h1 { font-size: 20px; font-weight: 700; letter-spacing: .5px; white-space: nowrap; }
    .header-date { font-size: 12px; opacity: .85; white-space: nowrap; }

    /* ---- Búsqueda ---- */
    .search-wrap {
      flex: 1;
      min-width: 180px;
      max-width: 420px;
      position: relative;
    }
    .search-wrap input {
      width: 100%;
      padding: 7px 36px 7px 12px;
      border: none;
      border-radius: 20px;
      font-size: 14px;
      outline: none;
      background: rgba(255,255,255,.18);
      color: #fff;
      -webkit-appearance: none;
    }
    .search-wrap input::placeholder { color: rgba(255,255,255,.7); }
    .search-wrap input:focus { background: rgba(255,255,255,.28); }
    .search-clear {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: rgba(255,255,255,.7);
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
      display: none;
      padding: 0;
    }
    .search-clear.visible { display: block; }
    .search-count { font-size: 11px; opacity: .8; white-space: nowrap; min-width: 60px; text-align: right; }

    .unit-filter-wrap {
      min-width: 180px;
      max-width: 240px;
    }
    .unit-filter {
      width: 100%;
      padding: 7px 10px;
      border: none;
      border-radius: 20px;
      font-size: 13px;
      outline: none;
      background: rgba(255,255,255,.18);
      color: #fff;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
    }
    .unit-filter:focus { background: rgba(255,255,255,.28); }
    .unit-filter option { color: #222; }

    /* ---- Grupos ---- */
    .group { margin: 0 0 32px; }
    .group.empty { display: none; }
    .group-separator {
      background: #e20025;
      color: #fff;
      padding: 18px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      user-select: none;
    }
    .group-separator:hover { background: #c8001f; }
    .group-label { font-size: 26px; font-weight: 700; }
    .group-count { font-size: 13px; opacity: .85; flex: 1; }
    .group-collapse-btn {
      background: none;
      border: none;
      color: rgba(255,255,255,.85);
      font-size: 14px;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      transition: transform .2s;
      flex-shrink: 0;
    }
    .group.collapsed .group-collapse-btn { transform: rotate(-90deg); }
    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px;
      padding: 16px 24px;
      overflow: hidden;
      transition: max-height .3s ease, padding .3s ease;
      max-height: 9999px;
    }
    .group.collapsed .products-grid {
      max-height: 0;
      padding-top: 0;
      padding-bottom: 0;
    }

    /* ---- Tarjetas ---- */
    .card-link { text-decoration: none; color: inherit; display: block; }
    .card-link.hidden { display: none; }
    .card {
      background: #fff;
      border: 1.5px solid #e8e8e8;
      border-radius: 10px;
      overflow: hidden;
      transition: box-shadow .15s, transform .15s;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .card.card-doble-hoja {
      background: #a1bbdf;
    }
    .card-link:hover .card {
      box-shadow: 0 4px 16px rgba(226,0,37,.18);
      transform: translateY(-2px);
      border-color: #e20025;
    }
    .card-img {
      width: 100%;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fafafa;
      border-bottom: 1px solid #f0f0f0;
      overflow: hidden;
    }
    .card-img img {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
    }
    .no-img { width: 100%; aspect-ratio: 1; background: #f0f0f0; }

    /* ---- Info ---- */
    .card-info { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .card-name {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-brand {
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: .3px;
    }
    .price-regular { font-size: 14px; font-weight: 700; color: #e20025; }
    .price-regular.striked { color: #aaa; text-decoration: line-through; font-weight: 400; font-size: 12px; }
    .price-discount { font-size: 15px; font-weight: 700; color: #009940; }
    .badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
    .badge {
      background: #e20025;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .unit-price {
      font-size: 11px;
      font-weight: 700;
      color: #2850a0;
      margin-top: auto;
      padding-top: 4px;
    }

    .range-filter-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 290px;
      flex-wrap: wrap;
    }
    .range-filter-wrap input[type="number"] {
      width: 96px;
      padding: 6px 8px;
      border: none;
      border-radius: 12px;
      outline: none;
      background: rgba(255,255,255,.18);
      color: #fff;
    }
    .range-filter-wrap input[type="number"]::placeholder { color: rgba(255,255,255,.7); }
    .range-filter-wrap .range-sep { opacity: .8; font-size: 12px; }
    .range-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      user-select: none;
    }

    .multi-filter {
      min-width: 180px;
      max-width: 240px;
      border-radius: 12px;
      background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.22);
      overflow: hidden;
    }
    .multi-filter summary {
      list-style: none;
      cursor: pointer;
      padding: 7px 10px;
      font-size: 13px;
      font-weight: 600;
    }
    .multi-filter summary::-webkit-details-marker { display: none; }
    .multi-options {
      max-height: 160px;
      overflow: auto;
      padding: 0 8px 8px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .multi-search-wrap {
      padding: 0 8px 8px;
    }
    .multi-search-input {
      width: 100%;
      border: none;
      border-radius: 10px;
      padding: 6px 8px;
      outline: none;
      background: rgba(255,255,255,.18);
      color: #fff;
      font-size: 12px;
      -webkit-appearance: none;
    }
    .multi-search-input::placeholder {
      color: rgba(255,255,255,.7);
    }
    .multi-search-input:focus {
      background: rgba(255,255,255,.28);
    }
    .multi-option {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 2px 0;
      user-select: none;
      transition: color .15s;
    }
    .multi-option input { accent-color: #fff; }
    .multi-option.hidden-option { display: none; }
    .multi-option.available-brand {
      color: #82f5a0;
      font-weight: 700;
    }

    @media print {
      body { background: #fff; }
      header {
        position: static;
        box-shadow: none;
        background: #fff;
        color: #000;
        border-bottom: 2px solid #e20025;
      }
      .search-wrap, .search-count, .group-collapse-btn { display: none !important; }
      .unit-filter-wrap { display: none !important; }
      .range-filter-wrap, .multi-filter { display: none !important; }
      .group { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
      .group-separator {
        background: #fff;
        color: #000;
        border-top: 1px solid #e20025;
        border-bottom: 1px solid #e20025;
      }
      .products-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        padding: 10px 12px;
      }
      .card { break-inside: avoid; page-break-inside: avoid; }
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

      function filterBrandOptions(queryText) {
        if (!brandOptions) return;
        var term = normalizeForSearch(queryText).trim();
        Array.from(brandOptions.querySelectorAll('.multi-option')).forEach(function (option) {
          var input = option.querySelector('input[type="checkbox"]');
          var value = input ? normalizeForSearch(input.value) : '';
          var match = !term || value.includes(term);
          option.classList.toggle('hidden-option', !match);
        });
      }

      function updateAvailableBrandHighlight(isOfertaFilterActive, visibleBrandSet) {
        if (!brandOptions) return;
        Array.from(brandOptions.querySelectorAll('.multi-option')).forEach(function (option) {
          var input = option.querySelector('input[type="checkbox"]');
          var value = input ? String(input.value || '').toLowerCase() : '';
          var isVisibleBrand = isOfertaFilterActive && visibleBrandSet.has(value);
          option.classList.toggle('available-brand', isVisibleBrand);
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
        var selectedBrands = getCheckedValues(brandOptions);
        var selectedPromos = getCheckedValues(promoOptions);
        var visibleCount = 0;
        var visibleBrands = new Set();
        var hasFilter = !!(normalizedTerm || selected || hasMin || hasMax || selectedBrands.size > 0 || selectedPromos.size > 0);

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

          var match = matchName && matchUnit && matchBrand && matchPromo && matchRange;
          card.classList.toggle('hidden', !match);
          if (match) {
            visibleCount++;
            if (brand) visibleBrands.add(brand);
          }
        });
        groups.forEach(updateGroup);
        updateAvailableBrandHighlight(selectedPromos.size > 0, visibleBrands);
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

      input.addEventListener('input', function () { filter(input.value, unitSelect.value); });
      unitSelect.addEventListener('change', function () { filter(input.value, unitSelect.value); });
      clearBtn.addEventListener('click', function () { input.value = ''; input.focus(); filter('', unitSelect.value); });
      if (priceMinInput) priceMinInput.addEventListener('input', function () { filter(input.value, unitSelect.value); });
      if (priceMaxInput) priceMaxInput.addEventListener('input', function () { filter(input.value, unitSelect.value); });
      if (rangeUseUnit) rangeUseUnit.addEventListener('change', function () { filter(input.value, unitSelect.value); });
      if (brandOptions) brandOptions.addEventListener('change', function () { filter(input.value, unitSelect.value); });
      if (brandSearchInput) brandSearchInput.addEventListener('input', function () { filterBrandOptions(brandSearchInput.value); });
      if (promoOptions) promoOptions.addEventListener('change', function () { filter(input.value, unitSelect.value); });

      filterBrandOptions('');
      filter('', unitSelect.value);

      // ---- Colapso de grupos ----
      document.querySelectorAll('.group-separator').forEach(function (sep) {
        sep.addEventListener('click', function () {
          sep.closest('.group').classList.toggle('collapsed');
        });
      });
    })();
  `;

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

    // En Vista Ligera, el orden final debe coincidir con el $/X mostrado en cada card.
    for (const group of groups) {
      group.products.sort((a, b) => {
        if (group.unitType) {
          const aPrice = resolveDisplayPrices(a).unitPriceValue;
          const bPrice = resolveDisplayPrices(b).unitPriceValue;
          const va = Number.isFinite(aPrice) ? aPrice : Infinity;
          const vb = Number.isFinite(bPrice) ? bPrice : Infinity;
          return va - vb;
        }

        const va = Number(a?.activePrice);
        const vb = Number(b?.activePrice);
        return (Number.isFinite(va) ? va : Infinity) - (Number.isFinite(vb) ? vb : Infinity);
      });
    }

    const dateStr = new Date().toLocaleDateString("es-AR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const sectionsHTML = groups.map(buildGroupHTML).join("\n");

    const html = [
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
      '        <option value="">Todos los filtros</option>',
      '        <option value="weight">$/Kg</option>',
      '        <option value="volume">$/L</option>',
      '        <option value="100g">$/100g</option>',
      '        <option value="square">$/m²</option>',
      '        <option value="unit">$/Unidad</option>',
      '      </select>',
      '    </div>',
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
      '      <div class="multi-search-wrap">',
      '        <input type="text" id="brand-search-input" class="multi-search-input" placeholder="Buscar marca..." autocomplete="off" spellcheck="false">',
      '      </div>',
      '      <div class="multi-options" id="brand-options"></div>',
      '    </details>',
      '    <details class="multi-filter" id="promo-filter">',
      '      <summary>Ofertas</summary>',
      '      <div class="multi-options" id="promo-options"></div>',
      '    </details>',
      '    <span class="search-count" id="search-count"></span>',
      '    <span class="header-date">' + dateStr + "</span>",
      "  </header>",
      "  <main>",
      sectionsHTML,
      "  </main>",
      autoPrint ? "  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });</" + "script>" : "",
      "  <script>" + SEARCH_SCRIPT + "</" + "script>",
      "</body>",
      "</html>",
    ].join("\n");

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    window.open(URL.createObjectURL(blob), "_blank");
  }

  return { generateRevistaHTML };
})();
