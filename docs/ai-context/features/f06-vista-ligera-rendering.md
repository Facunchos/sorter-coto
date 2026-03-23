# Vista Ligera Rendering

## Purpose
- Render products in lightweight grouped HTML with search/filter UX.
- Resolve displayed regular/promo/unit prices consistently.

## Entry Points
- Trigger: UI action `Generar -> Vista Ligera` and print flow reuse.
- Public functions:
- `generateRevistaHTML(products, options)` in `src/vistaLigera.js`
- internal resolvers (`inferPromoRatio`, `resolveDisplayPrices`) in `src/vistaLigera.js`

## Inputs / Outputs
- Inputs: normalized product list with pricing and promo metadata.
- Outputs: new tab/window HTML with cards grouped and sorted.
- Side effects: none on source page state.

## Dependencies
- Reads from: `utils.formatPrice`, `utils.unitLabel`.
- Reads from: `promoUtils.*` and `priceUtils.*` for promo/brand and resolved price logic.
- Calls into: browser window/document APIs for generated page.
- Writes to: generated HTML/CSS/JS in opened page context.

## Data Flow (5-8 steps)
1. Parse loose money strings from product fields.
2. Infer promo ratio for text-only promos (`2x1`, `3x2`, second-unit rules).
3. Resolve regular and promo prices from strongest candidates.
4. Choose unit base from max format/reference/unit parsed values.
5. Compute resolved unit price with single discount application.
6. Render product cards with promo badge and unit price line.
7. Attach card metadata (brand/promo/price/unit-price) for in-page filtering.
8. Build grouped sections and interactive header/filter controls, including Marcas search and oferta-aware brand highlighting.

## Invariants
- MUST avoid double-discounting unit prices.
- MUST apply formula using regular unit base: `(promoPrice * unitBase) / regularPrice` when discount exists.
- MUST only apply discount (green price + adjusted `$/X`) when promo text evidence exists (`promoTags`/`badges` meaningful token).
- MUST sort cards by the same resolved `$/X` value that is rendered in each card.
- MUST keep promo parsing tolerant to localized text variants.
- MUST keep range filter switchable between product price and resolved `$/X` using checkbox mode.
- MUST keep brand and oferta filters as multi-select include lists (checked values are visible values).
- MUST keep default brand/oferta state with no checks as "show all" (opt-in narrowing).
- MUST keep Marcas menu searchable by text for large brand sets.
- MUST highlight in green the Marcas entries currently visible on screen when at least one Ofertas option is active.
- Fallback behavior: if no valid discount inputs, show regular price path only.

## Failure Modes
- Symptom: unit price too low/high on promo products.
- Likely cause: discount applied twice or wrong unit base selection.
- Check: candidate price/base selection and promo inference branch.

## Edit Impact Checklist
- If formula changes, also review `features/f02-badges-price-extraction.md`.
- If output UX changes, review `features/f07-ui-panel-actions.md` for action expectations.
- Tests/manual checks: 2x1, 3x2, second unit promo, non-promo.
- `NEEDS_CODE_CHECK`: yes
