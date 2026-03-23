# Sorting And Order State

## Purpose
- Sort products by selected unit type and keep original ordering for reset.
- Coordinate with observer to avoid mutation loops.

## Entry Points
- Trigger: UI sort dropdown and reset button.
- Public functions:
- `sortProducts(filterType, onComplete)` in `src/sorter.js`
- `resetOrder(onComplete)` in `src/sorter.js`
- `getIsSorting()` and `getCurrentFilter()` in `src/sorter.js`

## Inputs / Outputs
- Inputs: filter type (`weight`, `volume`, `100g`, `square`, `unit`).
- Outputs: reordered `.producto-card` wrappers in `.productos.row`.
- Side effects: updates `currentFilter`, `isSorting`, original order map.

## Dependencies
- Reads from: DOM container and card wrappers.
- Calls into: `badges.extractProductData`, `badges.injectAllBadges`, `badges.removeAllBadges`.
- Writes to: DOM card order and in-memory `originalOrder`.

## Data Flow (5-8 steps)
1. Validate container `.productos.row`.
2. Set `isSorting=true`, set `currentFilter`.
3. On first sort, persist wrapper index order.
4. Build item list with extracted product data.
5. Split into with-price and without-price for current filter.
6. Sort with-price by `adjustedUnitPrice` ascending.
7. Append sorted wrappers back into container.
8. Reinject badges, run callback, then clear sorting flag in RAF.

## Invariants
- MUST preserve original order for `resetOrder` after first sort.
- MUST place products without target unit price at end.
- MUST not leave `isSorting` true after completion.
- Fallback behavior: if container not found, abort safely.

## Failure Modes
- Symptom: observer-sort loop or unstable order.
- Likely cause: missing `isSorting` guard or async race.
- Check: observer callback and RAF reset timing.

## Edit Impact Checklist
- If container selector changes, review `features/f01-bootstrap-observer.md` and `features/f07-ui-panel-actions.md`.
- If extraction path changes, review `features/f02-badges-price-extraction.md`.
- Tests/manual checks: sort each filter, reset, sort after infinite scroll.
- `NEEDS_CODE_CHECK`: yes
