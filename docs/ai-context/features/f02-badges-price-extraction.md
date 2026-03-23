# Badges And Price Extraction

## Purpose
- Extract effective unit-price data from product cards.
- Inject visible badge with adjusted or regular unit price.

## Entry Points
- Trigger: initial pass, observer pass, sort completion.
- Public functions:
- `extractProductData(productEl)` in `src/badges.js`
- `injectBadgeOnProduct(wrapper)` in `src/badges.js`
- `injectAllBadges()` and `removeAllBadges()` in `src/badges.js`

## Inputs / Outputs
- Inputs: product DOM (`small`, `h4.card-title`, `data-cnstrc-item-price`).
- Outputs: normalized data object with `unitType`, `adjustedUnitPrice`, `discountRatio`.
- Side effects: badge element insertion/removal and processed attr updates.

## Dependencies
- Reads from: `src/utils.js` parsers, regexes, formatters, labels.
- Calls into: none external beyond DOM APIs.
- Writes to: wrapper attr `data-coto-sorter-processed` (`done` or `no-data`).

## Fixtures
- `temp/DOMExample.md` contains real card structures for selector and text-pattern validation.
- Use it to verify `Precio Regular:` and `Precio por X` extraction assumptions before changing regex/selectors.

## Data Flow (5-8 steps)
1. Scan `small` lines for `Precio por X` and detect unit quantity/type.
2. Parse listed unit price and normalize unit type.
3. Resolve displayed price candidates from `h4` and item attribute.
4. Resolve regular price preferring `Precio Regular:` text.
5. Fallback regular price to attribute, then displayed price if needed.
6. Detect discount when displayed < regular and both are valid.
7. Compute adjusted unit price: `(displayed * listedUnitPrice) / regular`.
8. Inject badge style by discount state and mark wrapper status.

## Invariants
- MUST prioritize `Precio Regular:` text before attribute fallback.
- MUST only treat `done` as terminal; `no-data` must be re-attempted later.
- MUST keep adjusted-price formula aligned with Vista Ligera rule.
- Fallback behavior: if no valid data, mark `no-data` and skip badge.

## Failure Modes
- Symptom: discount badge wrong on promo cards.
- Likely cause: regular price source mismatch or displayed price candidate selection.
- Check: compare extracted displayed/regular pair in debug logs.

## Edit Impact Checklist
- If pricing formula changes, review `features/f06-vista-ligera-rendering.md`.
- If regex changes, review `features/f08-utils-and-normalization.md`.
- Tests/manual checks: regular-only card, promo card, card with missing unit block.
- `NEEDS_CODE_CHECK`: yes
