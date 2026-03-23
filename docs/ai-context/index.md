# AI Context Index

## Project
- Name: Coto Sorter - Precio por Unidad
- Stack: Browser Extension (Manifest V3), content script modules, DOM mutation handling, COTO Endeca/BFF APIs
- Primary goal: Sort and display products by effective unit price after discounts, and generate grouped promo views.

## Runtime Entry Points
- `content.js`: bootstraps modules, starts observer, injects UI, and keeps badges/sorting in sync.
- `popup/popup.js`: toggles debug mode via `chrome.storage.local`.

## Example Fixtures
- `temp/DOMExample.md`: real DOM snapshot of product cards and wrappers (`.producto-card`, `.card-container`, `small` labels).
- `temp/networkExample.json`: real BFF response shape with `response.results[*].data` pricing/discount fields.
- Use these fixtures for reasoning and prompt context in main branch without treating them as production source.

## Feature Map
- `features/f01-bootstrap-observer.md`: initialization lifecycle, debounce observer, and teardown.
- `features/f02-badges-price-extraction.md`: product data extraction, discount ratio, badge states.
- `features/f03-sorting-and-order-state.md`: sort/reset behavior, original order map, active filter state.
- `features/f04-api-capture-and-scraping.md`: PerformanceObserver URL capture and paged API scraping.
- `features/f05-revista-generation.md`: grouped printable generation flow.
- `features/f06-vista-ligera-rendering.md`: lightweight HTML view, promo inference, resolved unit prices.
- `features/f07-ui-panel-actions.md`: floating panel UX, dropdown actions, progress updates.
- `features/f08-utils-and-normalization.md`: shared constants, parsing, unit normalization.

## Cross-Feature Invariants
- Only `data-coto-sorter-processed="done"` is terminal. `"no-data"` wrappers must be retried.
- For promo ratio, prioritize `Precio Regular:` text when present; attribute fallback can be promo/current on some cards.
- For Vista Ligera `$/X`, apply discount ratio once over regular unit base. Avoid double-discounting.
- During sort mutation bursts, observer must not loop (`isSorting` guard + debounce).

## Decision Rules For Copilot
- Read this file first.
- Read only 1-2 feature files tied to the requested behavior.
- Open raw source only when a feature file marks `NEEDS_CODE_CHECK: yes`.
- When behavior changes, update the touched feature file in the same patch.
- For API/DOM edge cases, optionally include fixture files before opening additional source files.
