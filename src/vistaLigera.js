// ===========================================================
// vistaLigera.js — Generación de vista HTML ligera de productos
// Dependencias: revista (groupAndSortProducts)
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.vistaLigera = (function () {
  "use strict";

  // ---- Helpers de construcción HTML ----

  function buildCardHTML(p) {
    const safeName = (p.name || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    const imgTag = p.imgSrc
      ? `<img src="${p.imgSrc}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="no-img"></div>`;

    const priceClass = p.discountedPriceText ? "price-regular striked" : "price-regular";
    const discountRow = p.discountedPriceText
      ? `<div class="price-discount">${p.discountedPriceText}</div>`
      : "";

    const badgesHTML = p.badges && p.badges.length > 0
      ? `<div class="badges">${p.badges.map((b) => `<span class="badge">${b}</span>`).join("")}</div>`
      : "";

    const unitPriceHTML = p.unitPriceText
      ? `<div class="unit-price">${p.unitPriceText}</div>`
      : "";

    const tag = p.href ? "a" : "div";
    const attrs = [
      `class="card-link"`,
      `data-name="${safeName.toLowerCase()}"`,
      p.href ? `href="${p.href}" target="_blank"` : "",
    ].filter(Boolean).join(" ");

    return `<${tag} ${attrs}>
  <div class="card">
    <div class="card-img">${imgTag}</div>
    <div class="card-info">
      <div class="card-name">${p.name || "Producto"}</div>
      <div class="${priceClass}">${p.priceText || ""}</div>
      ${discountRow}
      ${badgesHTML}
      ${unitPriceHTML}
    </div>
  </div>
</${tag}>`;
  }

  function buildGroupHTML(group) {
    const count = group.products.length;
    const cardsHTML = group.products.map(buildCardHTML).join("\n");
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
    .search-wrap input[type="search"] {
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
    .search-wrap input[type="search"]::placeholder { color: rgba(255,255,255,.7); }
    .search-wrap input[type="search"]:focus { background: rgba(255,255,255,.28); }
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
  `;

  // ---- Script de búsqueda (se embebe como texto en el HTML final) ----

  const SEARCH_SCRIPT = `
    (function () {
      var input   = document.getElementById('search-input');
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

      function filter(q) {
        var term = q.trim().toLowerCase();
        var normalizedTerm = term.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
        var visibleCount = 0;
        cards.forEach(function (card) {
          var name = (card.dataset.name || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
          var match = !normalizedTerm || name.includes(normalizedTerm);
          card.classList.toggle('hidden', !match);
          if (match) visibleCount++;
        });
        groups.forEach(updateGroup);
        clearBtn.classList.toggle('visible', !!term);
        countEl.textContent = term
          ? visibleCount + ' resultado' + (visibleCount !== 1 ? 's' : '')
          : '';
      }

      input.addEventListener('input', function () { filter(input.value); });
      clearBtn.addEventListener('click', function () { input.value = ''; input.focus(); filter(''); });

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
  function generateRevistaHTML(products) {
    const { groupAndSortProducts } = window.CotoSorter.revista;
    const groups = groupAndSortProducts(products);

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
      "  <title>Vista Ligera \u2014 COTO Promos</title>",
      "  <style>" + STYLES + "  </style>",
      "</head>",
      "<body>",
      "  <header>",
      "    <h1>COTO \u2014 Vista Ligera</h1>",
      '    <div class="search-wrap">',
      '      <input type="search" id="search-input" placeholder="Buscar producto\u2026" autocomplete="off" spellcheck="false">',
      '      <button class="search-clear" id="search-clear" title="Limpiar b\u00fasqueda">\u2715</button>',
      "    </div>",
      '    <span class="search-count" id="search-count"></span>',
      '    <span class="header-date">' + dateStr + "</span>",
      "  </header>",
      "  <main>",
      sectionsHTML,
      "  </main>",
      "  <script>" + SEARCH_SCRIPT + "</" + "script>",
      "</body>",
      "</html>",
    ].join("\n");

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    window.open(URL.createObjectURL(blob), "_blank");
  }

  return { generateRevistaHTML };
})();
