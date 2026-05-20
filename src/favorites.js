// favorites.js — Local storage for shopping-list favorites
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.favorites = (function () {
  "use strict";

  const { normalizeAccents } = window.CotoSorter.utils;

  const STORAGE_KEY = "cotoSorterFavoritesV1";
  const DRAFT_TEXT_KEY = "cotoSorterShoppingDraftV1";
  let favoritesCache = [];
  let draftCache = "";

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

      area.get({ [key]: defaultValue }, (result) => {
        if (chrome?.runtime?.lastError) {
          resolve(defaultValue);
          return;
        }

        resolve(result && Object.prototype.hasOwnProperty.call(result, key)
          ? result[key]
          : defaultValue);
      });
    });
  }

  function writeStorageKey(key, value) {
    return new Promise((resolve) => {
      const area = getStorageArea();
      if (!area) {
        resolve();
        return;
      }

      area.set({ [key]: value }, () => {
        if (chrome?.runtime?.lastError) {
          resolve();
          return;
        }

        resolve();
      });
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

  function normalizeFavorite(data) {
    const name = String(data?.name || data?.searchTerm || "").trim();
    const note = String(data?.writtenText || data?.searchTerm || "").trim();

    if (!name) return null;

    return {
      id: String(data?.id || buildFavoriteId(data)),
      name,
      searchTerm: String(data?.searchTerm || note || name).trim(),
      writtenText: note,
      createdAt: Number(data?.createdAt) || Date.now(),
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
    buildFavoriteId,
    normalizeFavorite,
    getFavorites,
    getDraftText,
    saveDraftText,
    getFavoriteById,
    isFavorite,
    upsertFavorite,
    removeFavorite,
    updateFavorite,
    toggleFavorite,
  };
})();