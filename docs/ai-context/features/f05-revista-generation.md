# Revista Generation

## Purpose
- Build grouped printable output from scraped products.
- Orchestrate scrape -> group -> printable HTML generation.

## Entry Points
- Trigger: UI action `Generar -> Revista (Imprimible/PDF)`.
- Public functions:
- `startRevistaGeneration(maxCount, updateProgressFn)` in `src/revista.js`
- `generateRevistaPDF(products, progressCallback)` in `src/revista.js`
- `groupAndSortProducts(products)` in `src/revista.js`

## Inputs / Outputs
- Inputs: normalized products from API, optional max count.
- Outputs: grouped data and print-mode HTML output.
- Side effects: progress updates, alerts on empty result.

## Dependencies
- Reads from: `api.scrapeAllPages`, `utils.detectUnitTypeFromProduct`, `utils.unitTypeSeparatorLabel`.
- Calls into: `vistaLigera.generateRevistaHTML` with `printMode` and `autoPrint`.
- Writes to: none persistent.

## Data Flow (5-8 steps)
1. Start progress and fetch products from API pages.
2. Abort with user alert if zero products.
3. Apply optional `maxCount` limit.
4. Group products by unit type with stable order.
5. Sort each group by adjusted/reference/active price.
6. Call Vista Ligera generator in print mode.
7. Complete progress state and auto-hide status.

## Invariants
- MUST keep group order: `weight`, `volume`, `100g`, `square`, `unit`, uncategorized.
- MUST sort within each group ascending by best available unit-oriented price.
- MUST reuse Vista Ligera rendering pipeline (single rendering source).
- Fallback behavior: when unit type missing, place in uncategorized group.

## Failure Modes
- Symptom: grouped sections missing or wrong order.
- Likely cause: unit detection mismatch or group ordering regression.
- Check: `detectUnitTypeFromProduct` output and `ORDER` array.

## Edit Impact Checklist
- If grouping logic changes, review `features/f06-vista-ligera-rendering.md`.
- If scrape progress UI changes, review `features/f07-ui-panel-actions.md`.
- Tests/manual checks: print flow with and without max count.
- `NEEDS_CODE_CHECK`: yes
