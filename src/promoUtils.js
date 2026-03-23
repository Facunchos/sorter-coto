// promoUtils.js - promo/brand helpers for Vista Ligera and related views
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.promoUtils = (function () {
  "use strict";

  function escapeHtmlAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function inferBrandFromName(name) {
    const tokens = String(name || "")
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ-]/g, ""))
      .filter(Boolean);

    const blacklist = new Set([
      "DE", "Y", "CON", "SIN", "PARA", "POR", "AL", "LA", "EL", "LOS", "LAS",
      "KG", "GR", "GRM", "ML", "L", "LT", "LTS", "X", "U", "UN", "UNI", "UNIDAD",
    ]);

    const candidates = tokens.filter((t) => {
      const up = t.toUpperCase();
      if (blacklist.has(up)) return false;
      if (!/[A-ZÁÉÍÓÚÜÑ]{2,}/.test(up)) return false;
      if (/^\d+$/.test(up)) return false;
      return up === t;
    });

    if (candidates.length === 0) return "Sin marca";
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  }

  function resolveBrand(product) {
    const direct = [
      product?.brand,
      product?.productBrand,
      product?.product_brand,
      product?.brandName,
    ]
      .map((x) => String(x || "").trim())
      .find(Boolean);

    return direct || inferBrandFromName(product?.name);
  }

  function collectPromoText(product) {
    return [
      ...(Array.isArray(product?.promoTags) ? product.promoTags : []),
      ...(Array.isArray(product?.badges) ? product.badges : []),
    ]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
  }

  function getMeaningfulPromoTokens(product) {
    const tokens = [
      ...(Array.isArray(product?.promoTags) ? product.promoTags : []),
      ...(Array.isArray(product?.badges) ? product.badges : []),
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    return tokens.filter(
      (t) => !/^(todas\s+las\s+ofertas|llevando\s+\d+|no\s+acumulable\s+con\s+otras\s+promos)$/i.test(t)
    );
  }

  function pickPromoLabel(product) {
    const tokens = getMeaningfulPromoTokens(product);
    if (tokens.length === 0) return null;

    const direct = tokens.find((t) => /(?:\d+\s*x\s*\d+)|(?:segunda|2da)\s+unidad|\d+\s*%/i.test(t));
    return direct || tokens[0] || null;
  }

  return {
    escapeHtmlAttr,
    inferBrandFromName,
    resolveBrand,
    collectPromoText,
    getMeaningfulPromoTokens,
    pickPromoLabel,
  };
})();
