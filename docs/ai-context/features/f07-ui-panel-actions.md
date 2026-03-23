# UI Panel Actions

## Purpose
- Provide floating control panel for sorting, generation, reset, and support contact.
- Surface progress state for long-running generation flows.
- Provide quick search shortcuts (example: `Leche 1 litro`) from the `Generar` menu.

## Entry Points
- Trigger: `injectUI()` during startup.
- Public functions:
- `injectUI()` in `src/ui.js`
- `updateProgress(text, pct)` in `src/ui.js`
- delayed action helper `scheduleVistaLigeraAfterReload()` in `src/ui.js`

## Inputs / Outputs
- Inputs: user clicks, optional count input, session storage pending flags.
- Outputs: sort/generate/reset actions and visible progress updates.
- Side effects: DOM panel insertion, session storage write/remove, optional page reload.

## Dependencies
- Reads from: `utils.FILTER_TYPES`, `utils.normalizeAccents`.
- Calls into: `sorter.sortProducts`, `sorter.resetOrder`, `revista.startRevistaGeneration`, `revista.startRevistaHTMLGeneration`, `opiniones.showOpinionesPopup`.
- Writes to: `sessionStorage` (`cotoSorterPendingVistaLigera`), panel DOM state.

## Data Flow (5-8 steps)
1. Build floating panel (header, buttons, dropdowns, progress area, actions).
2. Top-level `Vista Ligera` button triggers HTML generation flow.
3. Sort dropdown maps each filter to `sortProducts` callback.
4. Generate dropdown routes to printable flow and quick search actions.
5. Quick action `Leche` triggers site search with term `Leche 1 litro`.
6. For repeated Vista Ligera use, persist pending count and reload page.
7. On next load, consume pending flag and auto-run Vista Ligera.
8. Reset action restores original product order.

## Invariants
- MUST keep `FILTER_TYPES` keys aligned with sorter logic.
- MUST remove pending Vista Ligera key after consuming it.
- MUST keep UI order: `Vista Ligera`, `Ordenar`, `Generar`.
- MUST close dropdowns after action selection.
- MUST prefer native on-page search input/form when available; fallback must use `/sitios/cdigi/productos/<slug>` URL format.
- MUST keep slug normalization accent-insensitive using shared `utils.normalizeAccents`.
- Fallback behavior: empty count means all products.

## Failure Modes
- Symptom: Vista Ligera action does nothing after first run.
- Likely cause: pending-reload state not consumed or reload branch regression.
- Check: session key set/remove path and post-reload timeout call.

## Edit Impact Checklist
- If filter options change, review `features/f03-sorting-and-order-state.md` and `features/f08-utils-and-normalization.md`.
- If progress semantics change, review `features/f05-revista-generation.md`.
- Tests/manual checks: sort, reset, revista, vista ligera repeat run.
- `NEEDS_CODE_CHECK`: yes
