// priceUtils.js - money parsing and resolved display prices
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.priceUtils = (function () {
  "use strict";

  const { formatPrice, unitLabel } = window.CotoSorter.utils;
  const { collectPromoText, getMeaningfulPromoTokens } = window.CotoSorter.promoUtils;

  function parseMoneyLoose(value) {
    if (value == null) return NaN;

    const raw = String(value).trim().replace(/\$/g, "").replace(/\s+/g, "");
    if (!raw) return NaN;

    const normalized = raw.replace(/[^\d,.-]/g, "");
    if (!normalized) return NaN;

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      return parseFloat(normalized.replace(/\./g, "").replace(/,/g, "."));
    }

    if (hasComma) {
      return parseFloat(normalized.replace(/,/g, "."));
    }

    if (hasDot) {
      const dotCount = (normalized.match(/\./g) || []).length;
      if (dotCount > 1) {
        const lastDot = normalized.lastIndexOf(".");
        const compact = normalized.slice(0, lastDot).replace(/\./g, "") + normalized.slice(lastDot);
        return parseFloat(compact);
      }

      const parts = normalized.split(".");
      if (parts.length === 2 && parts[1].length === 3) {
        return parseFloat(parts[0] + parts[1]);
      }

      return parseFloat(normalized);
    }

    return parseFloat(normalized);
  }

  function parseUnitPrice(unitPriceText) {
    const raw = String(unitPriceText || "");
    const match = raw.match(/^\s*\$\/([^:]+):\s*\$?(.+)$/i);
    if (!match) return { label: null, value: NaN };
    return {
      label: String(match[1] || "").trim(),
      value: parseMoneyLoose(match[2]),
    };
  }

  function inferPromoRatio(product) {
    const text = collectPromoText(product);
    if (!text) return null;

    const nxmRegex = /(\d+)\s*x\s*(\d+)/g;
    let nxmMatch;
    while ((nxmMatch = nxmRegex.exec(text)) !== null) {
      const units = parseInt(nxmMatch[1], 10);
      const pay = parseInt(nxmMatch[2], 10);
      if (Number.isFinite(units) && Number.isFinite(pay) && units > 0 && pay > 0 && pay < units) {
        return pay / units;
      }
    }

    const secondUnit = text.match(/(?:segunda|2da)\s+unidad[^\d]*(\d{1,3})\s*%/i);
    if (secondUnit) {
      const pct = parseFloat(secondUnit[1]);
      if (Number.isFinite(pct) && pct > 0 && pct < 100) {
        const hasDiscountWord = /\b(dto|descuento|off)\b/i.test(text);
        const secondUnitRatio = hasDiscountWord ? (1 - pct / 100) : (pct / 100);
        const effective = (1 + secondUnitRatio) / 2;
        if (effective > 0 && effective < 1) return effective;
      }
    }

    return null;
  }

  function resolveDisplayPrices(product) {
    const regularPrice = parseMoneyLoose(product?.priceText);
    const promoFromRaw = parseMoneyLoose(product?.promoPriceRaw);
    const promoFromDiscountedText = parseMoneyLoose(product?.discountedPriceText);
    const unitParsed = parseUnitPrice(product?.unitPriceText);
    const hasPromoEvidence = getMeaningfulPromoTokens(product).length > 0;

    let promoPrice = NaN;
    if (hasPromoEvidence) {
      const promoCandidates = [promoFromRaw, promoFromDiscountedText];
      for (const candidate of promoCandidates) {
        if (!Number.isFinite(candidate) || candidate <= 0) continue;
        if (Number.isFinite(regularPrice) && regularPrice > 0 && candidate < regularPrice) {
          promoPrice = candidate;
          break;
        }
        if (!Number.isFinite(promoPrice)) promoPrice = candidate;
      }
    }

    if (hasPromoEvidence && !Number.isFinite(promoPrice) && Number.isFinite(regularPrice) && regularPrice > 0) {
      const inferredRatio = inferPromoRatio(product);
      if (Number.isFinite(inferredRatio) && inferredRatio > 0 && inferredRatio < 1) {
        promoPrice = regularPrice * inferredRatio;
      }
    }

    const hasDiscount =
      Number.isFinite(regularPrice) && regularPrice > 0 &&
      Number.isFinite(promoPrice) && promoPrice > 0 && promoPrice < regularPrice;

    const unitBaseCandidates = [
      Number(product?.maxFormatPriceRaw),
      Number(product?.referencePrice),
      unitParsed.value,
    ].filter((n) => Number.isFinite(n) && n > 0);

    const unitBase = unitBaseCandidates.length ? Math.max(...unitBaseCandidates) : NaN;

    const unitPriceResolved = hasDiscount && Number.isFinite(unitBase)
      ? ((promoPrice * unitBase) / regularPrice)
      : (Number.isFinite(unitBase) ? unitBase : NaN);

    const regularPriceText = Number.isFinite(regularPrice) ? formatPrice(regularPrice) : (product?.priceText || "");
    const promoPriceText = hasDiscount ? formatPrice(promoPrice) : null;
    const unitPriceText = Number.isFinite(unitPriceResolved) && unitPriceResolved > 0
      ? `$/` + (unitParsed.label || unitLabel(product?.unitType) || "u") + `: ${formatPrice(unitPriceResolved)}`
      : "";

    return {
      hasDiscount,
      regularPriceText,
      promoPriceText,
      unitPriceText,
      unitPriceValue: Number.isFinite(unitPriceResolved) && unitPriceResolved > 0 ? unitPriceResolved : NaN,
    };
  }

  return {
    parseMoneyLoose,
    parseUnitPrice,
    resolveDisplayPrices,
  };
})();
