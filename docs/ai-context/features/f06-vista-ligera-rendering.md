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
- Calls into: browser window/document APIs for generated page.
- Writes to: generated HTML/CSS/JS in opened page context.

## Data Flow (5-8 steps)
1. Parse loose money strings from product fields.
2. Infer promo ratio for text-only promos (`2x1`, `3x2`, second-unit rules).
3. Resolve regular and promo prices from strongest candidates.
4. Choose unit base from max format/reference/unit parsed values.
5. Compute resolved unit price with single discount application.
6. Render product cards with promo badge and unit price line.
7. Build grouped sections and interactive header/filter controls.

## Invariants
- MUST avoid double-discounting unit prices.
- MUST apply formula using regular unit base: `(promoPrice * unitBase) / regularPrice` when discount exists.
- MUST keep promo parsing tolerant to localized text variants.
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
