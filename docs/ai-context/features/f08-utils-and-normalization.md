# Utils And Normalization

## Purpose
- Provide shared constants, regexes, parsing, and unit normalization.
- Keep consistent price and unit semantics across modules.

## Entry Points
- Trigger: imported by all runtime modules at content script load order.
- Public functions:
- `parsePrice`, `formatPrice`, `formatApiPrice` in `src/utils.js`
- `normalizeAccents` in `src/utils.js`
- `normalizeUnitType`, `cFormatoToUnitType`, `detectUnitTypeFromProduct` in `src/utils.js`
- `unitLabel`, `unitTypeSeparatorLabel` in `src/utils.js`

## Inputs / Outputs
- Inputs: raw text from DOM/API (`Precio por`, `cFormato`, money strings).
- Outputs: normalized numbers and canonical unit keys.
- Side effects: none.

## Dependencies
- Reads from: none external.
- Calls into: none external.
- Writes to: none.

## Data Flow (5-8 steps)
1. Parse local-format prices into numeric values.
2. Format numbers back into ARS text for UI display.
3. Normalize accents/diacritics for robust text comparisons and slug generation.
4. Match unit-price text with regex and quantity hints.
5. Normalize DOM/API unit descriptors to canonical keys.
6. Provide labels for badges and grouped separators.
7. Expose shared constants for debounce and badge attrs.

## Invariants
- MUST keep canonical unit keys stable: `weight`, `volume`, `100g`, `square`, `unit`.
- MUST keep `BADGE_ATTR` consistent with observer and badge modules.
- MUST keep `normalizeAccents` behavior stable (`NFD` + diacritic stripping) for search/slug parity.
- MUST preserve regex support for `Precio por 1` and `Precio por 100` forms.
- Fallback behavior: return `null` for unknown unit type.

## Failure Modes
- Symptom: cards cannot be classified for sorting/grouping.
- Likely cause: regex or normalization mismatch with site text.
- Check: `UNIT_PRICE_REGEX`, `normalizeUnitType`, `cFormatoToUnitType`.

## Edit Impact Checklist
- If unit key set changes, review all feature files and UI filter options.
- If money parsing changes, review `features/f02-badges-price-extraction.md` and `features/f06-vista-ligera-rendering.md`.
- Tests/manual checks: all unit types, decimal/thousand formats.
- `NEEDS_CODE_CHECK`: yes
