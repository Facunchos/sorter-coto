// ui.js — Inyección del panel flotante y controles
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.ui = (function () {
  "use strict";

  const { FILTER_TYPES } = window.CotoSorter.utils;
  const { debugLog } = window.CotoSorter.logger;
  const { sortProducts, resetOrder } = window.CotoSorter.sorter;
  const { startRevistaGeneration, startRevistaHTMLGeneration } = window.CotoSorter.revista;

  let panelEl = null;
  const filterDropdownItems = {};
  let btnOrdenar = null;

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

    // Revista PDF
    const itemRevista = document.createElement("button");
    itemRevista.className = "coto-sorter-dropdown-item";
    itemRevista.textContent = "📰 Revista Promos";
    itemRevista.title = "Genera un PDF con todos los productos de todas las páginas";
    itemRevista.addEventListener("click", () => {
      dropdown.classList.remove("coto-sorter-dropdown-open");
      startRevistaGeneration(getCount(), updateProgress);
    });
    dropdown.appendChild(itemRevista);

    // Vista Ligera HTML
    const itemHTML = document.createElement("button");
    itemHTML.className = "coto-sorter-dropdown-item";
    itemHTML.textContent = "⚡ Vista Ligera";
    itemHTML.title = "Abre una pestaña con los productos en HTML — sin descargar archivos";
    itemHTML.addEventListener("click", () => {
      dropdown.classList.remove("coto-sorter-dropdown-open");
      startRevistaHTMLGeneration(getCount(), updateProgress);
    });
    dropdown.appendChild(itemHTML);

    // Indicador de progreso
    const progressEl = document.createElement("div");
    progressEl.className = "coto-sorter-progress";
    progressEl.innerHTML = `
      <span class="coto-sorter-progress-text">Preparando...</span>
      <div class="coto-sorter-progress-bar-wrap">
        <div class="coto-sorter-progress-bar"></div>
      </div>
    `;

    wrap.appendChild(btnGenerar);
    wrap.appendChild(dropdown);
    wrap.appendChild(progressEl);
    return wrap;
  }

  function createResetButton() {
    const btn = document.createElement("button");
    btn.className = "coto-sorter-btn coto-sorter-btn-reset";
    btn.textContent = "Reset";
    btn.title = "Restaurar orden original y remover badges";
    btn.addEventListener("click", () => {
      debugLog("Button clicked: Reset");
      resetOrder(() => updateButtonStates(null));
    });
    return btn;
  }

  function createOpinionesButton() {
    const btn = document.createElement("button");
    btn.className = "coto-sorter-btn coto-sorter-btn-opiniones";
    btn.textContent = "Opiniones!";
    btn.title = "Próximamente";
    btn.disabled = true;
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
    debugLog("UI panel injected");
  }

  return { injectUI, updateButtonStates, updateProgress };
})();
