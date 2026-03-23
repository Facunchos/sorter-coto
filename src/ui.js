// ui.js — Inyección del panel flotante y controles
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.ui = (function () {
  "use strict";

  const { FILTER_TYPES, normalizeAccents } = window.CotoSorter.utils;
  const { debugLog } = window.CotoSorter.logger;
  const { sortProducts } = window.CotoSorter.sorter;
  const { startRevistaGeneration, startRevistaHTMLGeneration } = window.CotoSorter.revista;
  const { showOpinionesPopup } = window.CotoSorter.opiniones;

  const PENDING_VISTA_LIGERA_KEY = "cotoSorterPendingVistaLigera";

  let panelEl = null;
  const filterDropdownItems = {};
  let btnOrdenar = null;
  let hasUsedVistaLigera = false;

  function toSearchSlug(term) {
    return normalizeAccents(term)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function triggerSiteSearch(searchTerm) {
    const term = String(searchTerm || "").trim();
    if (!term) return;

    const inputSelectors = [
      'input[type="search"]',
      'input[name*="search" i]',
      'input[id*="search" i]',
      'input[placeholder*="buscar" i]',
      'input[aria-label*="buscar" i]',
    ];

    let input = null;
    for (const selector of inputSelectors) {
      input = document.querySelector(selector);
      if (input) break;
    }

    if (input) {
      input.focus();
      input.value = term;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));

      const form = input.closest("form");
      if (form) {
        form.requestSubmit ? form.requestSubmit() : form.submit();
      } else {
        const btn = document.querySelector('button[type="submit"], [aria-label*="buscar" i], .search-button');
        if (btn) btn.click();
      }

      debugLog("Generar dropdown: Triggered on-page search", term);
      return;
    }

    const slug = toSearchSlug(term);
    const fallbackUrl = `${window.location.origin}/sitios/cdigi/productos/${slug}`;
    window.open(fallbackUrl, "_blank");
    debugLog("Generar dropdown: Fallback search via productos URL", fallbackUrl);
  }

  function consumePendingVistaLigera() {
    const raw = sessionStorage.getItem(PENDING_VISTA_LIGERA_KEY);
    if (raw === null) {
      return { hasPending: false, count: null };
    }

    sessionStorage.removeItem(PENDING_VISTA_LIGERA_KEY);

    if (raw === "") {
      return { hasPending: true, count: null };
    }

    const parsed = parseInt(raw, 10);
    return {
      hasPending: true,
      count: Number.isNaN(parsed) ? null : parsed,
    };
  }

  function scheduleVistaLigeraAfterReload() {
    const { hasPending, count } = consumePendingVistaLigera();
    if (!hasPending) return;

    hasUsedVistaLigera = true;
    debugLog("Vista Ligera pendiente detectada tras recarga; ejecutando generación automática");

    setTimeout(() => {
      startRevistaHTMLGeneration(count, updateProgress);
    }, 250);
  }

  // =========================================================
  // Progreso y estado
  // =========================================================

  /** Muestra, actualiza u oculta el indicador de progreso (text=null para ocultar). */
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

  function updateButtonStates(currentFilter) {
    for (const ft of FILTER_TYPES) {
      const item = filterDropdownItems[ft.key];
      if (item) item.classList.toggle("coto-sorter-active", currentFilter === ft.key);
    }
    if (btnOrdenar) {
      const active = FILTER_TYPES.find((ft) => ft.key === currentFilter);
      btnOrdenar.textContent = active ? `Ordenar: ${active.label}` : "Ordenar";
      btnOrdenar.classList.toggle("coto-sorter-active", !!active);
    }
  }

  // =========================================================
  // Dragging
  // =========================================================

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
      el.style.left = origX + (e.clientX - startX) + "px";
      el.style.top = origY + (e.clientY - startY) + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      el.classList.remove("coto-sorter-dragging");
    });
  }

  // =========================================================
  // Builders de componentes UI
  // =========================================================

  function createHeader() {
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
    return header;
  }

  function createOrdenarDropdown() {
    const wrap = document.createElement("div");
    wrap.className = "coto-sorter-generate-wrap";

    btnOrdenar = document.createElement("button");
    btnOrdenar.className = "coto-sorter-btn";
    btnOrdenar.textContent = "Ordenar";
    btnOrdenar.title = "Elegir criterio de ordenamiento";

    const dropdown = document.createElement("div");
    dropdown.className = "coto-sorter-dropdown";

    for (const ft of FILTER_TYPES) {
      const item = document.createElement("button");
      item.className = "coto-sorter-dropdown-item";
      item.textContent = ft.label;
      item.title = ft.title + " (menor a mayor)";
      item.addEventListener("click", () => {
        dropdown.classList.remove("coto-sorter-dropdown-open");
        debugLog(`Ordenar dropdown: Sort by ${ft.key}`);
        sortProducts(ft.key, () => updateButtonStates(ft.key));
      });
      filterDropdownItems[ft.key] = item;
      dropdown.appendChild(item);
    }

    btnOrdenar.addEventListener("click", () => {
      dropdown.classList.toggle("coto-sorter-dropdown-open");
    });

    wrap.appendChild(btnOrdenar);
    wrap.appendChild(dropdown);
    return wrap;
  }

  function createGenerarDropdown() {
    const wrap = document.createElement("div");
    wrap.className = "coto-sorter-generate-wrap";

    const btnGenerar = document.createElement("button");
    btnGenerar.className = "coto-sorter-btn";
    btnGenerar.textContent = "Generar";
    btnGenerar.title = "Generar documentos a partir de los productos";

    const dropdown = document.createElement("div");
    dropdown.className = "coto-sorter-dropdown";

    btnGenerar.addEventListener("click", () => {
      dropdown.classList.toggle("coto-sorter-dropdown-open");
    });

    // Selector de cantidad
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

    const getCount = () => countInput.value ? parseInt(countInput.value, 10) : null;

    // Revista imprimible
    const itemRevista = document.createElement("button");
    itemRevista.className = "coto-sorter-dropdown-item";
    itemRevista.textContent = "📰 Revista (Imprimible/PDF)";
    itemRevista.title = "Abre una revista imprimible (podés guardarla como PDF desde el navegador)";
    itemRevista.addEventListener("click", () => {
      dropdown.classList.remove("coto-sorter-dropdown-open");
      startRevistaGeneration(getCount(), updateProgress);
    });
    dropdown.appendChild(itemRevista);

    // Búsqueda rápida de ejemplo
    const itemLeche = document.createElement("button");
    itemLeche.className = "coto-sorter-dropdown-item";
    itemLeche.textContent = "🥛 Leche";
    itemLeche.title = 'Busca "Leche 1 litro" en COTO';
    itemLeche.addEventListener("click", () => {
      dropdown.classList.remove("coto-sorter-dropdown-open");
      triggerSiteSearch("Leche 1 litro");
    });
    dropdown.appendChild(itemLeche);

    // Indicador de progreso
    const progressEl = document.createElement("div");
    progressEl.className = "coto-sorter-progress";
    const progressText = document.createElement("span");
    progressText.className = "coto-sorter-progress-text";
    progressText.textContent = "Preparando...";

    const progressBarWrap = document.createElement("div");
    progressBarWrap.className = "coto-sorter-progress-bar-wrap";

    const progressBar = document.createElement("div");
    progressBar.className = "coto-sorter-progress-bar";

    progressBarWrap.appendChild(progressBar);
    progressEl.appendChild(progressText);
    progressEl.appendChild(progressBarWrap);

    wrap.appendChild(btnGenerar);
    wrap.appendChild(dropdown);
    wrap.appendChild(progressEl);
    return wrap;
  }

  function createVistaLigeraButton() {
    const btn = document.createElement("button");
    btn.className = "coto-sorter-btn";
    btn.textContent = "⚡ Vista Ligera";
    btn.title = "Abre una pestaña con los productos en HTML — sin descargar archivos";
    btn.addEventListener("click", () => {
      const countInput = document.querySelector(".coto-sorter-dropdown-input");
      const count = countInput && countInput.value ? parseInt(countInput.value, 10) : null;

      if (hasUsedVistaLigera) {
        debugLog("Vista Ligera ya fue usada; recargando página para refrescar estado");
        sessionStorage.setItem(PENDING_VISTA_LIGERA_KEY, count === null ? "" : String(count));
        window.location.reload();
        return;
      }

      hasUsedVistaLigera = true;
      startRevistaHTMLGeneration(count, updateProgress);
    });
    return btn;
  }

  function createResetButton() {
    const btn = document.createElement("button");
    btn.className = "coto-sorter-btn coto-sorter-btn-reset";
    btn.textContent = "Reset";
    btn.title = "Recargar página y restaurar estado";
    btn.addEventListener("click", () => {
      debugLog("Button clicked: Reset (reload)");
      window.location.reload();
    });
    return btn;
  }

  function createOpinionesButton() {
    const btn = document.createElement("button");
    btn.className = "coto-sorter-btn coto-sorter-btn-opiniones";
    btn.textContent = "Opiniones!";
    btn.title = "Enviar feedback por email";
    btn.addEventListener("click", () => {
      showOpinionesPopup();
    });
    return btn;
  }

  // =========================================================
  // Inyección del panel
  // =========================================================

  function injectUI() {
    if (document.querySelector(".coto-sorter-panel")) return;

    panelEl = document.createElement("div");
    panelEl.className = "coto-sorter-panel";

    const header = createHeader();
    const buttons = document.createElement("div");
    buttons.className = "coto-sorter-buttons";

    buttons.appendChild(createVistaLigeraButton());
    buttons.appendChild(createOrdenarDropdown());
    buttons.appendChild(createGenerarDropdown());
    buttons.appendChild(createResetButton());

    const separator = document.createElement("hr");
    separator.className = "coto-sorter-separator";
    buttons.appendChild(separator);
    buttons.appendChild(createOpinionesButton());

    panelEl.appendChild(header);
    panelEl.appendChild(buttons);

    makeDraggable(panelEl, header);
    document.body.appendChild(panelEl);
    scheduleVistaLigeraAfterReload();
    debugLog("UI panel injected");
  }

  return { injectUI, updateButtonStates, updateProgress };
})();
