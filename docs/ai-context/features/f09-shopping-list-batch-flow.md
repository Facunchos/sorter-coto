# Shopping List Batch Flow

## Purpose
- Define a scalable flow for saving products as favorites and running a shopping list as multiple searches.
- Keep the implementation split into focused files so UI, storage, tab control, and generation stay isolated.

## Entry Points
- New shopping list modal opened from the extension UI.
- Favorite action on each product card.
- Tabbed manual-lists editor inside the modal.
- Batch runner that opens/searches tabs and triggers Vista Ligera per item.
- Batch tabs are marked in the URL hash and auto-run after the search page renders.

## Inputs / Outputs
- Inputs: saved favorites, saved manual lists, manually entered items, optional brand hints, current site search results.
- Outputs: one controlled search per item, generated Vista Ligera pages, local favorites, and per-tab session markers.
- Outputs: local-only favorites stored in `chrome.storage.local` and ephemeral per-tab batch markers in `sessionStorage`.
- Outputs: persisted manual draft text so reopening the modal restores the last written list.
- Outputs: persisted manual list names and item text so saved lists can be reopened and edited.

## Dependencies
- Uses browser extension storage for favorite persistence.
- Reuses existing search helpers and Vista Ligera generation entry points.
- Current MVP uses `window.open()` from the content script instead of privileged tab APIs.

## Data Flow (5-8 steps)
1. User saves products as favorites or opens the shopping list modal.
2. The modal shows a tab for manual lists and a separate tab for saved favorites.
3. The manual tab lets the user type a list name plus one item per line, then save it as a reusable list entry.
4. Clicking a saved manual list loads its name and text back into the same editor.
5. Saving with the same loaded name updates that list; changing the name creates a new saved list entry.
6. Favorites and saved manual lists each expose their own checkboxes so the user can select favorites, lists, or both.
7. The launcher expands selected manual lists into individual search items, one per line.
8. For each item, the launcher opens a new search tab with a hash marker.
9. The opened tab waits for product cards to appear instead of relying on a blind one-shot timeout.
10. If the hash marker is present, the tab uses a per-tab `sessionStorage` key to avoid duplicate runs.
11. Once the target page is ready, the tab runs the existing Vista Ligera generation flow for that search result page.
12. After launching Vista Ligera, the search tab closes itself so only the result tab stays open.
13. Temporary state is kept local to the tab and not shared across other tabs.
14. Favorite rows can be edited or removed directly from the modal, with basic validation on the edited name.
15. Active manual lists can be deleted from the editor row.

## Invariants
- Each job must be namespaced so one item cannot overwrite another item’s state.
- Shared favorite storage must remain local-only in `chrome.storage.local`.
- Manual-list storage must remain local-only and separate from favorites.
- Batch launch state should stay per-tab so parallel search tabs do not overwrite each other.
- Fixed delays are allowed only as a fallback, not as the primary readiness signal.
- Favorite data should be local-only for the first version.
- Batch tabs must use per-tab `sessionStorage` keys so retries in the same tab do not re-run the generator.
- The loaded manual list name controls whether save updates the current list or creates a new one.

## Failure Modes
- Symptom: searches step on each other.
- Likely cause: shared keys without per-tab isolation, parallel tab execution, or stale state cleanup.
- Symptom: search never completes.
- Likely cause: SPA navigation, delayed rendering, or a search selector mismatch.
- Symptom: old tabs reuse stale data.
- Likely cause: session markers were not cleared after success or failure.
- Symptom: the batch tab opens but nothing happens.
- Likely cause: popup blocking or the search page never exposed products before the timeout elapsed.
- Symptom: the search tab does not close after launch.
- Likely cause: browser blocked `window.close()` because the tab was not treated as script-opened.
- Symptom: the modal reopens empty even after typing a list.
- Likely cause: the draft text key was not saved or the storage write was blocked.
- Symptom: favorite edits do not stick.
- Likely cause: the edited name was empty or the favorite update failed validation.
- Symptom: a manual list saves as a new entry instead of updating.
- Likely cause: the loaded list name changed before saving, which intentionally creates a new list.

## UI Notes
- The modal now has a `Listas Manuales` tab and a collapsible `Favoritos Guardados` section.
- The save, new, delete, open, select all, and deselect all actions are arranged in compact single rows.
- Manual lists are saved as named items, and clicking one reloads the same textarea for editing.
- Clicking a favorite row toggles its checkbox, not just the checkbox itself.
- Manual-list deletion is a two-step button flow: first click arms the red confirm state, second click deletes.
- The favorites section starts expanded but can be collapsed to reduce visual noise.
- Saved favorites and saved manual lists are displayed as compact grid cards that wrap long names safely.
- Favorite rows show only the editable name, without duplicating the name in a secondary line.
- Favorite rows now render a `Prices` summary block with Vista Ligera-style regular/discount price classes and a custom hover card that shows the last verification date plus regular, discounted, discount-state, and actual price snapshots.
- Favorite price snapshots prefer the same Vista Ligera keys used by generated cards (`priceText`, `discountedPriceText`, `activePrice`, `referencePrice`, `adjustedReferencePrice`, `discountRatio`, `promoPriceRaw`, `promoTags`) and fall back to legacy `lastSeen*` fields when needed.

## Planned Favorite Price Scan
- Add a favorites-only action button that scans each selected favorite one at a time.
- Each scan should resolve the current product card, capture displayed price, regular price, and discount state.
- Save the last seen price fields back into the favorite record so the item remembers what was observed.
- Render a green badge when the favorite is currently on discount and a grey badge when it is not.
- Keep the search/check flow isolated from the manual-lists batch launcher so the two workflows stay independent.
- Prefer reusing the existing badge extraction logic instead of duplicating DOM parsing in the new scan action.

## Edit Impact Checklist
- If tab orchestration changes, review `features/f07-ui-panel-actions.md`.
- If saved product data shape changes, review `features/f02-badges-price-extraction.md` and `features/f08-utils-and-normalization.md`.
- If the generated output changes, review `features/f06-vista-ligera-rendering.md`.
- Manual checks: save favorite, run one item, run many items, reload mid-flow, open a second job while the first is active.