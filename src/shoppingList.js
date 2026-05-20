// shoppingList.js — Modal de lista de compras y batch runner por pestañas
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.shoppingList = (function () {
  "use strict";

  const { normalizeAccents } = window.CotoSorter.utils;
  const { debugLog } = window.CotoSorter.logger;
  const { favorites } = window.CotoSorter;

  const HASH_KEY = "coto-sorter-batch";
  const SESSION_PREFIX = "cotoSorterBatchStarted:";
  const OVERLAY_CLASS = "coto-sorter-shopping-overlay";

  function toSlug(value) {
    return normalizeAccents(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeSearchTerm(value) {
    return String(value || "").trim();
  }

  function parseListLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function buildSearchUrl(term) {
    const slug = toSlug(term);
    if (!slug) return null;
    return `${window.location.origin}/sitios/cdigi/productos/${slug}`;
  }

  function buildBatchUrl(item) {
    const url = buildSearchUrl(item.searchTerm || item.name);
    if (!url) return null;
    const batchId = encodeURIComponent(item.id || toSlug(item.searchTerm || item.name));
    return `${url}#${HASH_KEY}=${batchId}`;
  }

  function getBatchItemIdFromLocation() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    return params.get(HASH_KEY);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForProducts(maxWaitMs) {
    const limit = Math.max(1000, maxWaitMs || 12000);
    const startedAt = Date.now();

    while (Date.now() - startedAt < limit) {
      if (document.querySelectorAll(".producto-card").length > 0) {
        return true;
      }
      await wait(250);
    }

    return false;
  }

  async function maybeAutoRunBatch() {
    const itemId = getBatchItemIdFromLocation();
    if (!itemId) return false;

    const sessionKey = SESSION_PREFIX + itemId;
    if (sessionStorage.getItem(sessionKey) === "started") {
      return true;
    }

    sessionStorage.setItem(sessionKey, "started");
    debugLog("Batch tab detected; waiting for search results", itemId);

    const hasProducts = await waitForProducts(15000);
    if (!hasProducts) {
      debugLog("Batch tab finished waiting without products", itemId);
      return true;
    }

    setTimeout(() => {
      const revistaModule = window.CotoSorter.revista;
      if (!revistaModule || typeof revistaModule.startRevistaHTMLGeneration !== "function") {
        debugLog("Batch tab could not find Vista Ligera generator", itemId);
        return;
      }

      debugLog("Batch tab launching Vista Ligera", itemId);
      revistaModule.startRevistaHTMLGeneration(null, () => {});

      setTimeout(() => {
        try {
          if (!window.closed) {
            window.close();
          }
        } catch (err) {
          debugLog("Batch tab could not close itself", err?.message || err);
        }
      }, 1000);
    }, 300);

    return true;
  }

  function closeModal() {
    const overlay = document.querySelector("." + OVERLAY_CLASS);
    if (overlay) overlay.remove();
  }

  function createFavoriteRow(item, checked, onEdit, onDelete) {
    const row = document.createElement("div");
    row.className = "coto-sorter-shopping-row";

    const checkboxWrap = document.createElement("label");
    checkboxWrap.className = "coto-sorter-shopping-row-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.dataset.favoriteId = item.id;

    checkboxWrap.appendChild(checkbox);

    const body = document.createElement("div");
    body.className = "coto-sorter-shopping-row-body";

    const text = document.createElement("div");
    text.className = "coto-sorter-shopping-row-text";
    text.textContent = item.name;

    const note = document.createElement("div");
    note.className = "coto-sorter-shopping-row-note";
    note.textContent = item.writtenText && item.writtenText !== item.name ? item.writtenText : item.searchTerm || item.name;

    body.appendChild(text);
    body.appendChild(note);

    const actions = document.createElement("div");
    actions.className = "coto-sorter-shopping-row-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "coto-sorter-shopping-icon-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Editar favorito";
    editBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onEdit) onEdit(item);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "coto-sorter-shopping-icon-btn coto-sorter-shopping-icon-danger";
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Eliminar favorito";
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onDelete) onDelete(item);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(checkboxWrap);
    row.appendChild(body);
    row.appendChild(actions);
    return row;
  }

  function createManualListRow(item, isActive, onSelect) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "coto-sorter-shopping-manual-item";
    if (isActive) row.classList.add("is-active");

    const text = document.createElement("div");
    text.className = "coto-sorter-shopping-manual-item-text";
    text.textContent = item.name;

    const meta = document.createElement("div");
    meta.className = "coto-sorter-shopping-manual-item-meta";
    meta.textContent = `${parseListLines(item.text).length} ítems`;

    row.appendChild(text);
    row.appendChild(meta);
    row.addEventListener("click", () => {
      if (onSelect) onSelect(item);
    });

    return row;
  }

  function parseFavoriteEditInput(raw, currentItem) {
    const parts = String(raw || "")
      .split("\n")
      .map((part) => part.trim());

    const nextName = parts[0] || currentItem.name;
    if (!nextName) return null;

    return {
      name: nextName,
      searchTerm: parts[1] || currentItem.searchTerm || nextName,
      writtenText: parts[1] || currentItem.writtenText || parts[0] || nextName,
    };
  }

  async function openSelectedItems(selectedFavorites, manualTerms) {
    const items = [];

    for (const fav of selectedFavorites) {
      items.push({
        id: fav.id,
        name: fav.name,
        brand: fav.brand,
        searchTerm: normalizeSearchTerm(fav.searchTerm || fav.name),
      });
    }

    for (const term of manualTerms) {
      const normalizedTerm = normalizeSearchTerm(term);
      if (!normalizedTerm) continue;
      items.push({
        id: toSlug(normalizedTerm),
        name: normalizedTerm,
        brand: "",
        searchTerm: normalizedTerm,
      });
    }

    if (items.length === 0) {
      alert("No hay ítems para abrir.");
      return;
    }

    closeModal();

    for (const item of items) {
      const targetUrl = buildBatchUrl(item);
      if (!targetUrl) continue;
      window.open(targetUrl, "_blank");
      await wait(750);
    }
  }

  async function openShoppingListModal() {
    closeModal();

    const overlay = document.createElement("div");
    overlay.className = OVERLAY_CLASS;

    const modal = document.createElement("div");
    modal.className = "coto-sorter-shopping-modal";

    const header = document.createElement("div");
    header.className = "coto-sorter-shopping-header";

    const title = document.createElement("div");
    title.className = "coto-sorter-shopping-title";
    title.textContent = "Lista de compras";

    const subtitle = document.createElement("div");
    subtitle.className = "coto-sorter-shopping-subtitle";
    subtitle.textContent = "Guardá listas manuales, editálas desde el nombre o abrí favoritos guardados como búsquedas separadas.";

    const closeBtn = document.createElement("button");
    closeBtn.className = "coto-sorter-btn coto-sorter-shopping-close";
    closeBtn.type = "button";
    closeBtn.textContent = "Cerrar";
    closeBtn.addEventListener("click", closeModal);

    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(closeBtn);

    const tabs = document.createElement("div");
    tabs.className = "coto-sorter-shopping-tabs";

    const manualTabBtn = document.createElement("button");
    manualTabBtn.type = "button";
    manualTabBtn.className = "coto-sorter-shopping-tab-btn is-active";
    manualTabBtn.textContent = "Listas Manuales";

    const favoritesTabBtn = document.createElement("button");
    favoritesTabBtn.type = "button";
    favoritesTabBtn.className = "coto-sorter-shopping-tab-btn";
    favoritesTabBtn.textContent = "Favoritos Guardados";

    tabs.appendChild(manualTabBtn);
    tabs.appendChild(favoritesTabBtn);

    const panels = document.createElement("div");
    panels.className = "coto-sorter-shopping-panels";

    const manualPanel = document.createElement("section");
    manualPanel.className = "coto-sorter-shopping-tab-panel";

    const favoritesPanel = document.createElement("section");
    favoritesPanel.className = "coto-sorter-shopping-tab-panel";
    favoritesPanel.hidden = true;

    const manualTop = document.createElement("div");
    manualTop.className = "coto-sorter-shopping-section";

    const manualLabel = document.createElement("label");
    manualLabel.className = "coto-sorter-shopping-label";
    manualLabel.textContent = "Nombre de la lista";

    const manualNameInput = document.createElement("input");
    manualNameInput.className = "coto-sorter-shopping-name-input";
    manualNameInput.type = "text";
    manualNameInput.placeholder = "Ej: Feria del finde";

    const manualItemsLabel = document.createElement("label");
    manualItemsLabel.className = "coto-sorter-shopping-label";
    manualItemsLabel.textContent = "Ítems manuales (uno por línea)";

    const manualInput = document.createElement("textarea");
    manualInput.className = "coto-sorter-shopping-textarea";
    manualInput.rows = 6;
    manualInput.placeholder = "Leche\nHarina 0000\nManteca 200g";

    const manualStatus = document.createElement("div");
    manualStatus.className = "coto-sorter-shopping-manual-status";

    const manualActions = document.createElement("div");
    manualActions.className = "coto-sorter-shopping-actions coto-sorter-shopping-manual-actions";

    const saveManualBtn = document.createElement("button");
    saveManualBtn.className = "coto-sorter-btn coto-sorter-shopping-primary";
    saveManualBtn.type = "button";
    saveManualBtn.textContent = "Guardar lista";

    const newManualBtn = document.createElement("button");
    newManualBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    newManualBtn.type = "button";
    newManualBtn.textContent = "Nueva lista";

    manualActions.appendChild(saveManualBtn);
    manualActions.appendChild(newManualBtn);

    const manualListsWrap = document.createElement("div");
    manualListsWrap.className = "coto-sorter-shopping-favorites";

    const manualListsTitle = document.createElement("div");
    manualListsTitle.className = "coto-sorter-shopping-label";
    manualListsTitle.textContent = "Items guardados";

    const manualListsList = document.createElement("div");
    manualListsList.className = "coto-sorter-shopping-list coto-sorter-shopping-manual-list";
    manualListsList.textContent = "Cargando listas manuales...";

    manualListsWrap.appendChild(manualListsTitle);
    manualListsWrap.appendChild(manualListsList);

    manualTop.appendChild(manualLabel);
    manualTop.appendChild(manualNameInput);
    manualTop.appendChild(manualItemsLabel);
    manualTop.appendChild(manualInput);
    manualTop.appendChild(manualStatus);
    manualTop.appendChild(manualActions);
    manualTop.appendChild(manualListsWrap);

    const favoritesTop = document.createElement("div");
    favoritesTop.className = "coto-sorter-shopping-section";

    const favoritesCollapseBtn = document.createElement("button");
    favoritesCollapseBtn.type = "button";
    favoritesCollapseBtn.className = "coto-sorter-shopping-collapse-btn";

    const favoritesCollapseText = document.createElement("span");
    favoritesCollapseText.textContent = "Favoritos Guardados";

    const favoritesCollapseCaret = document.createElement("span");
    favoritesCollapseCaret.className = "coto-sorter-shopping-caret";
    favoritesCollapseCaret.textContent = "▾";

    favoritesCollapseBtn.appendChild(favoritesCollapseText);
    favoritesCollapseBtn.appendChild(favoritesCollapseCaret);

    const favoritesBody = document.createElement("div");
    favoritesBody.className = "coto-sorter-shopping-collapsible-body";

    const favoritesList = document.createElement("div");
    favoritesList.className = "coto-sorter-shopping-list";
    favoritesList.textContent = "Cargando favoritos...";

    favoritesBody.appendChild(favoritesList);
    favoritesTop.appendChild(favoritesCollapseBtn);
    favoritesTop.appendChild(favoritesBody);

    const footerActions = document.createElement("div");
    footerActions.className = "coto-sorter-shopping-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "coto-sorter-btn coto-sorter-shopping-primary";
    openBtn.type = "button";
    openBtn.textContent = "Abrir seleccionados";

    const selectAllBtn = document.createElement("button");
    selectAllBtn.className = "coto-sorter-btn coto-sorter-shopping-secondary";
    selectAllBtn.type = "button";
    selectAllBtn.textContent = "Seleccionar todo";

    footerActions.appendChild(openBtn);
    footerActions.appendChild(selectAllBtn);

    manualPanel.appendChild(manualTop);
    favoritesPanel.appendChild(favoritesTop);
    panels.appendChild(manualPanel);
    panels.appendChild(favoritesPanel);

    modal.appendChild(header);
    modal.appendChild(tabs);
    modal.appendChild(panels);
    modal.appendChild(footerActions);
    overlay.appendChild(modal);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);

    let favoritesState = [];
    let manualListsState = [];
    let selectedManualList = null;
    let activeTab = "manual";
    let favoritesExpanded = true;

    function setActiveTab(tab) {
      activeTab = tab;
      manualTabBtn.classList.toggle("is-active", tab === "manual");
      favoritesTabBtn.classList.toggle("is-active", tab === "favorites");
      manualPanel.hidden = tab !== "manual";
      favoritesPanel.hidden = tab !== "favorites";
    }

    function setFavoritesExpanded(expanded) {
      favoritesExpanded = expanded;
      favoritesBody.hidden = !expanded;
      favoritesCollapseBtn.classList.toggle("is-collapsed", !expanded);
      favoritesCollapseCaret.textContent = expanded ? "▾" : "▸";
    }

    function syncManualDrafts() {
      favorites.saveDraftManualListName(manualNameInput.value);
      favorites.saveDraftText(manualInput.value);
    }

    async function refreshManualListsList() {
      manualListsState = await favorites.getManualLists();
      manualListsList.textContent = "";

      if (manualListsState.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "coto-sorter-shopping-empty";
        emptyState.textContent = "Todavía no guardaste listas manuales.";
        manualListsList.appendChild(emptyState);
        return;
      }

      for (const item of manualListsState) {
        const row = createManualListRow(item, selectedManualList?.id === item.id, async (currentItem) => {
          selectedManualList = currentItem;
          manualNameInput.value = currentItem.name;
          manualInput.value = currentItem.text;
          manualStatus.textContent = `Editando: ${currentItem.name}`;
          await favorites.saveDraftManualListName(manualNameInput.value);
          await favorites.saveDraftText(manualInput.value);
          await refreshManualListsList();
          setActiveTab("manual");
        });
        manualListsList.appendChild(row);
      }
    }

    async function refreshFavoritesList() {
      favoritesState = await favorites.getFavorites();
      favoritesList.textContent = "";

      if (favoritesState.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "coto-sorter-shopping-empty";
        emptyState.textContent = "No hay favoritos guardados todavía.";
        favoritesList.appendChild(emptyState);
        return;
      }

      for (const item of favoritesState) {
        const row = createFavoriteRow(
          item,
          true,
          async (currentItem) => {
            const currentText = [currentItem.name, currentItem.writtenText || currentItem.searchTerm || currentItem.name]
              .filter(Boolean)
              .join("\n");

            const raw = window.prompt(
              "Editar favorito: primera línea = nombre, segunda línea = texto guardado/búsqueda",
              currentText
            );

            if (raw === null) return;

            const patch = parseFavoriteEditInput(raw, currentItem);
            if (!patch || !patch.name) {
              alert("El nombre no puede estar vacío.");
              return;
            }

            const result = await favorites.updateFavorite(currentItem.id, patch);
            if (!result.saved) {
              alert("No se pudo actualizar el favorito.");
              return;
            }

            await refreshFavoritesList();
          },
          async (currentItem) => {
            const confirmed = window.confirm(`Eliminar el favorito \"${currentItem.name}\"?`);
            if (!confirmed) return;

            const removed = await favorites.removeFavorite(currentItem.id);
            if (!removed) {
              alert("No se pudo eliminar el favorito.");
              return;
            }

            await refreshFavoritesList();
          }
        );
        favoritesList.appendChild(row);
      }
    }

    async function saveCurrentManualList() {
      const currentName = normalizeSearchTerm(manualNameInput.value);
      const currentText = String(manualInput.value || "").trim();
      const listLines = parseListLines(currentText);

      if (!currentName) {
        alert("Poné un nombre para la lista.");
        return;
      }

      if (listLines.length === 0) {
        alert("La lista necesita al menos un ítem.");
        return;
      }

      syncManualDrafts();

      let result = null;
      if (selectedManualList && currentName === selectedManualList.name) {
        result = await favorites.updateManualList(selectedManualList.id, {
          name: currentName,
          text: currentText,
        });
      } else {
        result = await favorites.saveManualList({
          name: currentName,
          text: currentText,
        });
      }

      if (!result || !result.saved) {
        alert("No se pudo guardar la lista.");
        return;
      }

      selectedManualList = result.manualList;
      manualNameInput.value = result.manualList.name;
      manualInput.value = result.manualList.text;
      manualStatus.textContent = `Guardada: ${result.manualList.name}`;
      await favorites.saveDraftManualListName(manualNameInput.value);
      await favorites.saveDraftText(manualInput.value);
      await refreshManualListsList();
    }

    manualNameInput.addEventListener("input", () => {
      syncManualDrafts();
      if (selectedManualList && normalizeSearchTerm(manualNameInput.value) !== selectedManualList.name) {
        manualStatus.textContent = `Editando: ${selectedManualList.name}`;
      } else if (selectedManualList) {
        manualStatus.textContent = `Editando: ${selectedManualList.name}`;
      } else {
        manualStatus.textContent = "";
      }
    });

    manualInput.addEventListener("input", () => {
      syncManualDrafts();
      if (selectedManualList) {
        manualStatus.textContent = `Editando: ${selectedManualList.name}`;
      }
    });

    saveManualBtn.addEventListener("click", saveCurrentManualList);

    newManualBtn.addEventListener("click", async () => {
      selectedManualList = null;
      manualNameInput.value = "";
      manualInput.value = "";
      manualStatus.textContent = "Nueva lista";
      await favorites.saveDraftManualListName("");
      await favorites.saveDraftText("");
      await refreshManualListsList();
      manualNameInput.focus();
    });

    favoritesCollapseBtn.addEventListener("click", () => {
      setFavoritesExpanded(!favoritesExpanded);
    });

    manualTabBtn.addEventListener("click", () => setActiveTab("manual"));
    favoritesTabBtn.addEventListener("click", () => setActiveTab("favorites"));

    selectAllBtn.addEventListener("click", () => {
      favoritesList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = true;
      });
    });

    openBtn.addEventListener("click", async () => {
      const selectedFavorites = [];
      favoritesList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        if (!checkbox.checked) return;
        const favorite = favoritesState.find((item) => item.id === checkbox.dataset.favoriteId);
        if (favorite) selectedFavorites.push(favorite);
      });

      const manualTerms = parseListLines(manualInput.value);

      await favorites.saveDraftManualListName(manualNameInput.value);
      await favorites.saveDraftText(manualInput.value);
      openSelectedItems(selectedFavorites, manualTerms);
    });

    manualNameInput.value = await favorites.getDraftManualListName();
    manualInput.value = await favorites.getDraftText();
    manualStatus.textContent = manualNameInput.value ? `Lista pendiente: ${manualNameInput.value}` : "";

    await refreshManualListsList();
    await refreshFavoritesList();
    setActiveTab("manual");
    setFavoritesExpanded(true);
  }

  async function toggleFavoriteFromCard(data) {
    const result = await favorites.toggleFavorite(data);
    debugLog(result.saved ? "Favorite saved" : "Favorite removed", data?.name || data?.searchTerm || "");
    return result;
  }

  async function refreshFavoriteButton(buttonEl, data) {
    if (!buttonEl || !data) return;
    const saved = await favorites.isFavorite(data.id);
    buttonEl.classList.toggle("is-saved", saved);
    buttonEl.setAttribute("aria-pressed", saved ? "true" : "false");
    buttonEl.title = saved ? "Quitar de favoritos" : "Guardar en favoritos";
    buttonEl.textContent = saved ? "♥" : "♡";
  }

  return {
    HASH_KEY,
    buildBatchUrl,
    maybeAutoRunBatch,
    openShoppingListModal,
    toggleFavoriteFromCard,
    refreshFavoriteButton,
  };
})();
