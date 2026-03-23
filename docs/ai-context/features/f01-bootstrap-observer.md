# Bootstrap And Observer

## Purpose
- Initialize extension runtime modules on COTO pages.
- Keep badges/sort state updated as Angular adds product cards.

## Entry Points
- Trigger: `DOMContentLoaded` or immediate run when document is already loaded.
- Public functions:
- `init()` in `content.js`
- `setupObserver()` in `content.js`
- `teardownObserver()` in `content.js`

## Inputs / Outputs
- Inputs: DOM lifecycle events, mutation events.
- Outputs: UI injected, observer active, badge/sort refresh scheduling.
- Side effects: registers `MutationObserver`, timers, unload cleanup.

## Dependencies
- Reads from: `window.CotoSorter.utils` (`DEBOUNCE_MS`, `BADGE_ATTR`).
- Calls into: `api.setupApiUrlCapture`, `ui.injectUI`, `badges.injectAllBadges`, `badges.injectBadgeOnProduct`, `sorter.sortProducts`.
- Writes to: observer/timer local state.

## Data Flow (5-8 steps)
1. `initDebugFlag()` runs first to enable optional logs.
2. `init()` sets API capture, injects panel, starts observer.
3. Initial delayed badge pass runs after 500ms.
4. On mutation, observer debounces work by `DEBOUNCE_MS`.
5. If sorting active, observer exits early.
6. If filter active, re-applies sort to include new cards.
7. Else, processes cards not marked `data-coto-sorter-processed="done"`.
8. On unload, observer disconnects and timer is cleared.

## Invariants
- MUST skip mutation handling while `sorter.getIsSorting()` is true.
- MUST debounce mutation bursts.
- MUST treat non-`done` wrappers as retryable.
- Fallback behavior: if no products at init time, observer handles later inserts.

## Failure Modes
- Symptom: badges never appear after dynamic load.
- Likely cause: observer not attached or selector mismatch.
- Check: observer startup log and query of `.producto-card`.

## Edit Impact Checklist
- If you change debounce logic, review `features/f03-sorting-and-order-state.md`.
- If you change processed attribute semantics, review `features/f02-badges-price-extraction.md`.
- Tests/manual checks: initial load, infinite scroll, sort active then new card insertion.
- `NEEDS_CODE_CHECK`: yes
