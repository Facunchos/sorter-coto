# CLAUDE.md

This file provides guidance to Claude Code (and other coding agents) when working in this repository.

## Project Summary

- Project: Coto Sorter - Precio por Unidad
- Type: Browser extension (Manifest V3)
- Goal: Compute and use effective post-discount unit price for Coto Digital products, then sort/render product views based on that value.
- Runtime style: DOM-driven content script with mutation handling and lightweight in-page UI controls.

## Core Entry Points

- `content.js`: bootstrap lifecycle, observer setup/teardown, delayed initial badge pass.
- `src/ui.js`: floating panel injection, sort/generate/reset actions, progress updates.
- `src/badges.js`: card extraction and badge rendering.
- `src/sorter.js`: ordering logic and original-order restore.
- `src/api.js`: capture/search endpoints and scraping helpers.
- `src/revista.js` + `src/vistaLigera.js`: grouped output generation flows.

## Required Context-First Workflow

Before editing code:

1. Read `docs/ai-context/index.md`.
2. Read 1-2 relevant files from `docs/ai-context/features/`.
3. Open source files only when exact implementation details are required.

## Critical Invariants

- `data-coto-sorter-processed="done"` is terminal; wrappers marked differently must remain retryable.
- Promo ratio must prioritize the visible "Precio Regular:" signal when present.
- For Vista Ligera `$/X`, apply discount ratio once over the regular unit base (never double-discount).
- During sorting bursts, avoid observer loops using sort guards + debounce.
- Keep UI control order in panel: `Vista Ligera`, `Ordenar`, `Generar`.

## Feature Mapping (Behavior Source Of Truth)

- Bootstrap/observer: `docs/ai-context/features/f01-bootstrap-observer.md`
- Badges/price extraction: `docs/ai-context/features/f02-badges-price-extraction.md`
- Sorting/order state: `docs/ai-context/features/f03-sorting-and-order-state.md`
- API capture/scraping: `docs/ai-context/features/f04-api-capture-and-scraping.md`
- Revista generation: `docs/ai-context/features/f05-revista-generation.md`
- Vista Ligera rendering: `docs/ai-context/features/f06-vista-ligera-rendering.md`
- UI panel/actions: `docs/ai-context/features/f07-ui-panel-actions.md`
- Utils/normalization: `docs/ai-context/features/f08-utils-and-normalization.md`

## Change Rules

- Preserve documented invariants unless the task explicitly changes behavior.
- If behavior or data flow changes, update matching feature docs in `docs/ai-context/features/` in the same patch.
- Keep edits scoped to the minimum feature surface.

## Validation Checklist

- Manual smoke checks for changed behavior:
  - Initial page load badge injection
  - Dynamic load/infinite scroll badge injection
  - Sort then receive new cards
  - Reset order correctness
  - Vista Ligera and Revista generation paths
- Run ai-context coverage warning script when source behavior changed:
  - `bash scripts/check-ai-context.sh`

## Debugging

- Debug flag is controlled via extension popup (`popup/popup.js`) and persisted in `chrome.storage.local`.
- Logs use `[CotoSorter]` prefix.

## Security/Privacy Constraints

- Keep logic local to browser context.
- Do not add telemetry, tracking, or external data exfiltration.
- Do not introduce backend dependencies for core functionality.