// ===========================================================
// utils.js — Constantes, parsers y normalizadores de tipo
// ===========================================================
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.utils = (function () {
  "use strict";

  // ---- Constants ----
  const DEBOUNCE_MS = 400;
  const BADGE_CLASS = "coto-sorter-badge";
  const BADGE_ATTR = "data-coto-sorter-processed";
  const UNIT_PRICE_REGEX =
    /Precio\s+por\s+(?:1|100)\s+(Kilo(?:gramo)?(?:\s+escurrido)?|Litro|[Gg]ramos?|[Cc]uadrado|[Uu]nidad)\s*:\s*\$([\d\.,]+)/i;
  const UNIT_QTY_REGEX = /Precio\s+por\s+(1|100)\s+/i;

  // All available filter types with labels (used by sorter UI y sorter lógica)
  const FILTER_TYPES = [
    { key: "weight",  label: "$/Kg ↑",     title: "Ordenar por precio real por kilogramo" },
    { key: "volume",  label: "$/L ↑",      title: "Ordenar por precio real por litro" },
    { key: "100g",    label: "$/100g ↑",   title: "Ordenar por precio por 100 gramos" },
    { key: "square",  label: "$/m² ↑",     title: "Ordenar por precio por cuadrado" },
    { key: "unit",    label: "$/Unidad ↑", title: "Ordenar por precio por unidad" },
  ];

  // ---- Price Parsers ----

  /**
   * Parsea precio en formato argentino a Number.
   * "$3.950,00" -> 3950.00 | "899,00" -> 899.00
   */
  function parsePrice(raw) {
    if (raw == null) return NaN;
    const cleaned = String(raw)
      .replace(/\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return parseFloat(cleaned);
  }

  /**
   * Formatea número a precio argentino: 1348.47 -> "$1.348,47"
   */
  function formatPrice(num) {
    if (isNaN(num)) return "—";
    const parts = num.toFixed(2).split(".");
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "$" + intPart + "," + parts[1];
  }

  /**
   * Formatea precio numérico raw (de API) a "$X.XXX,XX". Null si falla.
   */
  function formatApiPrice(raw) {
    const num = parseFloat(String(raw).replace(",", "."));
    if (isNaN(num)) return null;
    const parts = num.toFixed(2).split(".");
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "$" + intPart + "," + parts[1];
  }

  // ---- Unit Type Normalization ----

  /**
   * Normaliza texto de unidad a categoría interna.
   * "Kilo"/"Kilogramo escurrido" → "weight" | "Litro" → "volume"
   * "Gramos" (qty=100) → "100g" | "Cuadrado" → "square" | "Unidad" → "unit"
   */
  function normalizeUnitType(unitText, qty) {
    const lower = unitText.toLowerCase().trim();
    if (lower.startsWith("kilo")) return "weight";
    if (lower.startsWith("litro")) return "volume";
    if (lower.startsWith("gramo") && qty === "100") return "100g";
    if (lower.startsWith("cuadrado")) return "square";
    if (lower.startsWith("unidad")) return "unit";
    return null;
  }

  /**
   * Normaliza string cFormato de la API Endeca a tipo interno.
   * "Kilo"/"Kilogramo" → "weight" | "Litro" → "volume"
   * "100 Gramos" → "100g" | "Metro Cuadrado" → "square" | "Unidad" → "unit"
   */
  function cFormatoToUnitType(cFormato) {
    if (!cFormato) return null;
    const f = cFormato.trim().toLowerCase();
    if (f.startsWith("kilo") || f.startsWith("kg")) return "weight";
    if (f.startsWith("litro") || f.startsWith("lt")) return "volume";
    if (f.startsWith("100")) return "100g";
    if (f.startsWith("metro")) return "square";
    if (f.startsWith("unidad") || f.startsWith("uni")) return "unit";
    return null;
  }

  /** Label corto para mostrar en badge: "kg", "L", "100g", "m²", "u" */
  function unitLabel(unitType) {
    switch (unitType) {
      case "weight":  return "kg";
      case "volume":  return "L";
      case "100g":    return "100g";
      case "square":  return "m²";
      case "unit":    return "u";
      default:        return "?";
    }
  }

  /** Texto para la página separadora del PDF por categoría. */
  function unitTypeSeparatorLabel(unitType) {
    switch (unitType) {
      case "weight":  return "Precio por 1 Kg";
      case "volume":  return "Precio por 1 Litro";
      case "100g":    return "Precio por 100 Gramos";
      case "square":  return "Precio por 1 Metro Cuadrado";
      case "unit":    return "Precio por 1 Unidad";
      default:        return "Sin categoría de ordenamiento";
    }
  }

  /**
   * Detecta el tipo de unidad de un producto.
   * Productos de la API tienen `unitType` directo; fallback a unitPriceText.
   */
  function detectUnitTypeFromProduct(product) {
    if (product.unitType) return product.unitType;
    if (!product.unitPriceText) return null;
    const text = product.unitPriceText.toLowerCase();
    if (/kilo/i.test(text)) return "weight";
    if (/litro/i.test(text)) return "volume";
    if (/100\s*gramo/i.test(text)) return "100g";
    if (/cuadrado/i.test(text)) return "square";
    if (/unidad/i.test(text)) return "unit";
    return null;
  }

  return {
    DEBOUNCE_MS,
    BADGE_CLASS,
    BADGE_ATTR,
    UNIT_PRICE_REGEX,
    UNIT_QTY_REGEX,
    FILTER_TYPES,
    parsePrice,
    formatPrice,
    formatApiPrice,
    normalizeUnitType,
    cFormatoToUnitType,
    unitLabel,
    unitTypeSeparatorLabel,
    detectUnitTypeFromProduct,
  };
})();
