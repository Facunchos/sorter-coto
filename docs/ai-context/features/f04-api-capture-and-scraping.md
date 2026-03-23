# API Capture And Scraping

## Purpose
- Capture latest Endeca/BFF product API URLs from browser performance entries.
- Scrape paged product data and normalize it for revista/vista flows.

## Entry Points
- Trigger: startup capture setup and revista generation requests.
- Public functions:
- `setupApiUrlCapture()` in `src/api.js`
- `scrapeAllPages(progressCb)` in `src/api.js`
- URL builders and response parsers in `src/api.js`

## Inputs / Outputs
- Inputs: `PerformanceResourceTiming`, current page URL, API JSON pages.
- Outputs: normalized product list (name, brand, prices, unit type, promo tags, image, href).
- Side effects: stores `capturedEndecaUrl` and `capturedBffUrl` in module state.

## Dependencies
- Reads from: `window.location`, `performance`, `fetch` responses.
- Calls into: utils (`cFormatoToUnitType`, `formatApiPrice`, `unitLabel`).
- Writes to: local captured URL variables.

## Fixtures
- `temp/networkExample.json` is a real sample for BFF parsing (`response.results[*].data`, `discounts`, `price[]`).
- Use this fixture to validate parser expectations without running live requests.

## Data Flow (5-8 steps)
1. Scan buffered resource entries to initialize latest Endeca/BFF URLs.
2. Start `PerformanceObserver` to track future fetch/xhr URLs.
3. On scrape request, prefer captured URL matching current path.
4. Build paged URL (`No/Nrpp` for Endeca or `page/num_results_per_page` for BFF).
5. Fetch pages with configured parallelism.
6. Parse responses into normalized internal product objects.
7. Merge/dedupe products and report progress.
8. Return consolidated list to revista/vista generators.

## Invariants
- MUST accept both Endeca and BFF sources.
- MUST preserve category/page context when building URLs.
- MUST preserve source brand metadata (`brand`/`productBrand`/`product_brand`) in normalized products when available.
- MUST fail safely when one source is unavailable.
- Fallback behavior: use `window.location.href` when captured URL is invalid for current page.

## Failure Modes
- Symptom: revista shows zero products.
- Likely cause: URL capture miss, endpoint format change, or parser mismatch.
- Check: captured URL validity and response-shape parser guards.

## Edit Impact Checklist
- If price normalization changes, review `features/f06-vista-ligera-rendering.md` and `features/f05-revista-generation.md`.
- If endpoint matching changes, test both Endeca and BFF category pages.
- Tests/manual checks: fresh load, navigation between categories, repeated revista generation.
- `NEEDS_CODE_CHECK`: yes
