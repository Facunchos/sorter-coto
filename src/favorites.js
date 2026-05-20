// favorites.js — Local storage for shopping-list favorites
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.favorites = (function () {
  "use strict";

  const { normalizeAccents } = window.CotoSorter.utils;

  const STORAGE_KEY = "cotoSorterFavoritesV1";

  function getStorageArea() {
    return chrome && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
  }

  function readStorage(defaultValue) {
    return new Promise((resolve) => {
      const area = getStorageArea();
      if (!area) {
        resolve(defaultValue);
        return;
      }

      area.get({ [STORAGE_KEY]: defaultValue }, (result) => {
        resolve(result && Object.prototype.hasOwnProperty.call(result, STORAGE_KEY)
          ? result[STORAGE_KEY]
          : defaultValue);
      });
    });
  }

  function writeStorage(value) {
    return new Promise((resolve) => {
      const area = getStorageArea();
      if (!area) {
        resolve();
        return;
      }

      area.set({ [STORAGE_KEY]: value }, () => resolve());
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
    const brand = toSlug(data?.brand || "");
    const href = toSlug(data?.href || "");
    return [name, brand, href].filter(Boolean).join("__") || toSlug(String(Date.now()));
  }

  function normalizeFavorite(data) {
    const name = String(data?.name || data?.searchTerm || "").trim();
    const brand = String(data?.brand || "").trim() || "Sin marca";
    const href = String(data?.href || "").trim();
    const imgSrc = String(data?.imgSrc || "").trim();

    if (!name) return null;

    return {
      id: String(data?.id || buildFavoriteId(data)),
      name,
      brand,
      href,
      imgSrc,
      searchTerm: String(data?.searchTerm || name).trim(),
      createdAt: Number(data?.createdAt) || Date.now(),
    };
  }

  async function getFavorites() {
    const stored = await readStorage([]);
    return Array.isArray(stored) ? stored : [];
  }

  async function saveFavorites(favorites) {
    await writeStorage(Array.isArray(favorites) ? favorites : []);
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
    buildFavoriteId,
    normalizeFavorite,
    getFavorites,
    getFavoriteById,
    isFavorite,
    upsertFavorite,
    removeFavorite,
    toggleFavorite,
  };
})();