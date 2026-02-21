// ===========================================================
// ui.js — Inyección del panel flotante y controles
// Dependencias: utils, logger, sorter, revista
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.ui = (function () {
  "use strict";

  const { FILTER_TYPES } = window.CotoSorter.utils;
  const { debugLog } = window.CotoSorter.logger;
  const { sortProducts, resetOrder } = window.CotoSorter.sorter;
  const { startRevistaGeneration } = window.CotoSorter.revista;

  // ---- Estado interno ----
  let panelEl = null;
  const filterDropdownItems = {};
  let btnOrdenar = null;

  // ---- Barra de progreso ----

  /**
   * Muestra, actualiza u oculta el indicador de progreso.
   * Pasar text=null para ocultar.
   */
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

  // ---- Estado de botones ----

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

  // ---- Dragging ----

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

  // ---- Inyección del panel ----

  function injectUI() {
    if (document.querySelector(".coto-sorter-panel")) return;

    panelEl = document.createElement("div");
    panelEl.className = "coto-sorter-panel";

    // Header (drag handle)
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

    // Contenedor de botones
    const buttons = document.createElement("div");
    buttons.className = "coto-sorter-buttons";

    // ---- Ordenar + dropdown ----
    const ordenarWrap = document.createElement("div");
    ordenarWrap.className = "coto-sorter-generate-wrap";

    btnOrdenar = document.createElement("button");
    btnOrdenar.className = "coto-sorter-btn";
    btnOrdenar.textContent = "Ordenar";
    btnOrdenar.title = "Elegir criterio de ordenamiento";

    const ordenarDropdown = document.createElement("div");
    ordenarDropdown.className = "coto-sorter-dropdown";

    for (const ft of FILTER_TYPES) {
      const item = document.createElement("button");
      item.className = "coto-sorter-dropdown-item";
      item.textContent = ft.label;
      item.title = ft.title + " (menor a mayor)";
      item.addEventListener("click", () => {
        ordenarDropdown.classList.remove("coto-sorter-dropdown-open");
        debugLog(`Ordenar dropdown: Sort by ${ft.key}`);
        sortProducts(ft.key, () => updateButtonStates(ft.key));
      });
      filterDropdownItems[ft.key] = item;
      ordenarDropdown.appendChild(item);
    }

    btnOrdenar.addEventListener("click", () => {
      ordenarDropdown.classList.toggle("coto-sorter-dropdown-open");
    });

    ordenarWrap.appendChild(btnOrdenar);
    ordenarWrap.appendChild(ordenarDropdown);
    buttons.appendChild(ordenarWrap);

    // ---- Generar + dropdown ----
    const generateWrap = document.createElement("div");
    generateWrap.className = "coto-sorter-generate-wrap";

    const btnGenerar = document.createElement("button");
    btnGenerar.className = "coto-sorter-btn";
    btnGenerar.textContent = "Generar";
    btnGenerar.title = "Generar documentos a partir de los productos";

    const genDropdown = document.createElement("div");
    genDropdown.className = "coto-sorter-dropdown";

    btnGenerar.addEventListener("click", () => {
      genDropdown.classList.toggle("coto-sorter-dropdown-open");
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

    genDropdown.appendChild(countLabel);
    genDropdown.appendChild(countInput);

    const itemRevista = document.createElement("button");
    itemRevista.className = "coto-sorter-dropdown-item";
    itemRevista.textContent = "📰 Revista Promos";
    itemRevista.title = "Genera un PDF con todos los productos de todas las páginas";
    itemRevista.addEventListener("click", () => {
      genDropdown.classList.remove("coto-sorter-dropdown-open");
      const count = countInput.value ? parseInt(countInput.value, 10) : null;
      startRevistaGeneration(count, updateProgress);
    });

    genDropdown.appendChild(itemRevista);

    // Indicador de progreso
    const progressEl = document.createElement("div");
    progressEl.className = "coto-sorter-progress";
    progressEl.innerHTML = `
      <span class="coto-sorter-progress-text">Preparando...</span>
      <div class="coto-sorter-progress-bar-wrap">
        <div class="coto-sorter-progress-bar"></div>
      </div>
    `;

    generateWrap.appendChild(btnGenerar);
    generateWrap.appendChild(genDropdown);
    generateWrap.appendChild(progressEl);
    buttons.appendChild(generateWrap);

    // ---- Reset ----
    const btnReset = document.createElement("button");
    btnReset.className = "coto-sorter-btn coto-sorter-btn-reset";
    btnReset.textContent = "Reset";
    btnReset.title = "Restaurar orden original y remover badges";
    btnReset.addEventListener("click", () => {
      debugLog("Button clicked: Reset");
      resetOrder(() => updateButtonStates(null));
    });
    buttons.appendChild(btnReset);

    // ---- Separador ----
    const separator = document.createElement("hr");
    separator.className = "coto-sorter-separator";
    buttons.appendChild(separator);

    // ---- Opiniones (próximamente) ----
    const btnOpiniones = document.createElement("button");
    btnOpiniones.className = "coto-sorter-btn coto-sorter-btn-opiniones";
    btnOpiniones.textContent = "Opiniones!";
    btnOpiniones.title = "Próximamente";
    btnOpiniones.disabled = true;
    buttons.appendChild(btnOpiniones);

    panelEl.appendChild(header);
    panelEl.appendChild(buttons);

    makeDraggable(panelEl, header);
    document.body.appendChild(panelEl);
    debugLog("UI panel injected");
  }

  return { injectUI, updateButtonStates, updateProgress };
})();
