// favorites.js — Local storage for shopping-list favorites
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.favorites = (function () {
  "use strict";

  const { normalizeAccents } = window.CotoSorter.utils;

  const STORAGE_KEY = "cotoSorterFavoritesV1";
  const DRAFT_TEXT_KEY = "cotoSorterShoppingDraftV1";
  const DRAFT_NAME_KEY = "cotoSorterShoppingDraftNameV1";
  const MANUAL_LISTS_KEY = "cotoSorterManualListsV1";
  let favoritesCache = [];
  let draftCache = "";
  let draftNameCache = "";
  let manualListsCache = [];

  function getStorageArea() {
    return chrome && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
  }

  function readStorageKey(key, defaultValue) {
    return new Promise((resolve) => {
      const area = getStorageArea();
      if (!area) {
        resolve(defaultValue);
        return;
      }

      try {
        area.get({ [key]: defaultValue }, (result) => {
          if (chrome?.runtime?.lastError) {
            resolve(defaultValue);
            return;
          }

          resolve(result && Object.prototype.hasOwnProperty.call(result, key)
            ? result[key]
            : defaultValue);
        });
      } catch (err) {
        resolve(defaultValue);
      }
    });
  }

  function writeStorageKey(key, value) {
    return new Promise((resolve) => {
      const area = getStorageArea();
      if (!area) {
        resolve();
        return;
      }

      try {
        area.set({ [key]: value }, () => {
          if (chrome?.runtime?.lastError) {
            resolve();
            return;
          }

          resolve();
        });
      } catch (err) {
        resolve();
      }
    });
  }

  function toSlug(value) {
    return normalizeAccents(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function buildFavoriteId(data) {
    const name = toSlug(data?.name || data?.searchTerm || "");
    const note = toSlug(data?.writtenText || data?.searchTerm || "");
    return [name, note].filter(Boolean).join("__") || toSlug(String(Date.now()));
  }

  function buildManualListId(data) {
    const name = toSlug(data?.name || "lista");
    return `${name || "lista"}__${Date.now().toString(36)}`;
  }

  function normalizeFavorite(data) {
    const name = String(data?.name || data?.searchTerm || "").trim();
    const note = String(data?.writtenText || data?.searchTerm || "").trim();
    const priceText = data?.priceText != null ? String(data.priceText) : null;
    const discountedPriceText = data?.discountedPriceText != null ? String(data.discountedPriceText) : null;

    if (!name) return null;

    return {
      id: String(data?.id || buildFavoriteId(data)),
      name,
      searchTerm: String(data?.searchTerm || note || name).trim(),
      writtenText: note,
      createdAt: Number(data?.createdAt) || Date.now(),
      brand: data?.brand ? String(data.brand) : null,
      href: data?.href ? String(data.href) : null,
      imgSrc: data?.imgSrc ? String(data.imgSrc) : null,
      priceText,
      discountedPriceText,
      activePrice: Number.isFinite(Number(data?.activePrice)) ? Number(data.activePrice) : null,
      referencePrice: Number.isFinite(Number(data?.referencePrice)) ? Number(data.referencePrice) : null,
      adjustedReferencePrice: Number.isFinite(Number(data?.adjustedReferencePrice)) ? Number(data.adjustedReferencePrice) : null,
      discountRatio: Number.isFinite(Number(data?.discountRatio)) ? Number(data.discountRatio) : 1,
      promoPriceRaw: Number.isFinite(Number(data?.promoPriceRaw)) ? Number(data.promoPriceRaw) : null,
      promoTags: Array.isArray(data?.promoTags) ? data.promoTags.map((item) => String(item)) : [],
      unitPriceText: data?.unitPriceText != null ? String(data.unitPriceText) : null,
      unitType: data?.unitType ? String(data.unitType) : null,
      // Optional last-seen price snapshot fields (may be undefined)
      lastSeenDisplayedPrice: Number.isFinite(Number(data?.lastSeenDisplayedPrice)) ? Number(data.lastSeenDisplayedPrice) : null,
      lastSeenRegularPrice: Number.isFinite(Number(data?.lastSeenRegularPrice)) ? Number(data.lastSeenRegularPrice) : null,
      lastSeenAdjustedUnitPrice: Number.isFinite(Number(data?.lastSeenAdjustedUnitPrice)) ? Number(data.lastSeenAdjustedUnitPrice) : null,
      lastSeenDiscountRatio: Number.isFinite(Number(data?.lastSeenDiscountRatio)) ? Number(data.lastSeenDiscountRatio) : 1,
      lastCheckedAt: Number(data?.lastCheckedAt) || null,
    };
  }

  function normalizeManualList(data) {
    const name = String(data?.name || data?.title || "").trim();
    const text = String(data?.text || data?.items || "").trim();

    if (!name) return null;

    return {
      id: String(data?.id || buildManualListId(data)),
      name,
      text,
      createdAt: Number(data?.createdAt) || Date.now(),
      updatedAt: Number(data?.updatedAt) || Number(data?.createdAt) || Date.now(),
    };
  }

  async function getFavorites() {
    const stored = await readStorageKey(STORAGE_KEY, favoritesCache);
    favoritesCache = Array.isArray(stored) ? stored : [];
    return favoritesCache;
  }

  async function saveFavorites(favorites) {
    favoritesCache = Array.isArray(favorites) ? favorites : [];
    await writeStorageKey(STORAGE_KEY, favoritesCache);
  }

  async function getDraftText() {
    const stored = await readStorageKey(DRAFT_TEXT_KEY, draftCache);
    draftCache = typeof stored === "string" ? stored : "";
    return draftCache;
  }

  async function saveDraftText(text) {
    draftCache = String(text || "");
    await writeStorageKey(DRAFT_TEXT_KEY, draftCache);
  }

  async function getDraftManualListName() {
    const stored = await readStorageKey(DRAFT_NAME_KEY, draftNameCache);
    draftNameCache = typeof stored === "string" ? stored : "";
    return draftNameCache;
  }

  async function saveDraftManualListName(text) {
    draftNameCache = String(text || "");
    await writeStorageKey(DRAFT_NAME_KEY, draftNameCache);
  }

  async function getManualLists() {
    const stored = await readStorageKey(MANUAL_LISTS_KEY, manualListsCache);
    manualListsCache = Array.isArray(stored) ? stored : [];
    return manualListsCache;
  }

  async function saveManualLists(manualLists) {
    manualListsCache = Array.isArray(manualLists) ? manualLists : [];
    await writeStorageKey(MANUAL_LISTS_KEY, manualListsCache);
  }

  async function getManualListById(id) {
    if (!id) return null;
    const manualLists = await getManualLists();
    return manualLists.find((item) => item.id === id) || null;
  }

  async function saveManualList(data) {
    const manualList = normalizeManualList(data);
    if (!manualList) return { saved: false, manualList: null };

    const manualLists = await getManualLists();
    const index = manualLists.findIndex((item) => item.id === manualList.id);

    if (index === -1) {
      manualLists.unshift(manualList);
    } else {
      manualLists[index] = manualList;
    }

    await saveManualLists(manualLists);
    return { saved: true, manualList };
  }

  async function updateManualList(id, patch) {
    if (!id) return { saved: false, manualList: null };

    const manualLists = await getManualLists();
    const index = manualLists.findIndex((item) => item.id === id);
    if (index === -1) return { saved: false, manualList: null };

    const current = manualLists[index];
    const nextManualList = normalizeManualList({
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    });

    if (!nextManualList) return { saved: false, manualList: null };

    manualLists[index] = nextManualList;
    await saveManualLists(manualLists);
    return { saved: true, manualList: nextManualList };
  }

  async function removeManualList(id) {
    if (!id) return false;
    const manualLists = await getManualLists();
    const next = manualLists.filter((item) => item.id !== id);
    if (next.length === manualLists.length) return false;
    await saveManualLists(next);
    return true;
  }

  async function getFavoriteById(id) {
    if (!id) return null;
    const favorites = await getFavorites();
    return favorites.find((item) => item.id === id) || null;
  }

  async function isFavorite(id) {
    return !!(await getFavoriteById(id));
  }

  async function upsertFavorite(data) {
    const favorite = normalizeFavorite(data);
    if (!favorite) return { saved: false, favorite: null };

    const favorites = await getFavorites();
    const next = favorites.filter((item) => item.id !== favorite.id);
    next.unshift(favorite);
    await saveFavorites(next);

    return { saved: true, favorite };
  }

  async function removeFavorite(id) {
    if (!id) return false;
    const favorites = await getFavorites();
    const next = favorites.filter((item) => item.id !== id);
    if (next.length === favorites.length) return false;
    await saveFavorites(next);
    return true;
  }

  async function updateFavorite(id, patch) {
    if (!id) return { saved: false, favorite: null };

    const favorites = await getFavorites();
    const index = favorites.findIndex((item) => item.id === id);
    if (index === -1) return { saved: false, favorite: null };

    const current = favorites[index];
    const nextFavorite = normalizeFavorite({
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
    });

    if (!nextFavorite) return { saved: false, favorite: null };

    favorites[index] = nextFavorite;
    await saveFavorites(favorites);
    return { saved: true, favorite: nextFavorite };
  }

  async function toggleFavorite(data) {
    const favorite = normalizeFavorite(data);
    if (!favorite) return { saved: false, favorite: null };

    const favorites = await getFavorites();
    const exists = favorites.some((item) => item.id === favorite.id);
    if (exists) {
      await removeFavorite(favorite.id);
      return { saved: false, favorite };
    }

    const next = [favorite, ...favorites];
    await saveFavorites(next);
    return { saved: true, favorite };
  }

  return {
    STORAGE_KEY,
    DRAFT_TEXT_KEY,
    DRAFT_NAME_KEY,
    MANUAL_LISTS_KEY,
    buildFavoriteId,
    buildManualListId,
    normalizeFavorite,
    normalizeManualList,
    getFavorites,
    getDraftText,
    saveDraftText,
    getDraftManualListName,
    saveDraftManualListName,
    getManualLists,
    saveManualLists,
    getFavoriteById,
    getManualListById,
    isFavorite,
    upsertFavorite,
    saveManualList,
    updateManualList,
    removeManualList,
    removeFavorite,
    updateFavorite,
    toggleFavorite,
  };
})();