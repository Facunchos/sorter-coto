# Shopping List Batch Flow

## Purpose
- Define a scalable flow for saving products as favorites and running a shopping list as multiple searches.
- Keep the implementation split into focused files so UI, storage, tab control, and generation stay isolated.

## Entry Points
- New shopping list modal opened from the extension UI.
- Favorite action on each product card.
- Batch runner that opens/searches tabs and triggers Vista Ligera per item.
- Batch tabs are marked in the URL hash and auto-run after the search page renders.

## Inputs / Outputs
- Inputs: saved favorites, manually entered items, optional brand hints, current site search results.
- Outputs: one controlled search per item, generated Vista Ligera pages, local favorites, and per-tab session markers.
- Outputs: local-only favorites stored in `chrome.storage.local` and ephemeral per-tab batch markers in `sessionStorage`.
- Outputs: persisted manual draft text so reopening the modal restores the last written list.

## Dependencies
- Uses browser extension storage for favorite persistence.
- Reuses existing search helpers and Vista Ligera generation entry points.
- Current MVP uses `window.open()` from the content script instead of privileged tab APIs.

## Data Flow (5-8 steps)
1. User saves products as favorites or opens the shopping list modal.
2. The modal builds a simple list of favorite items plus any manual lines the user typed and stored.
3. For each item, the launcher opens a new search tab with a hash marker.
4. The opened tab waits for product cards to appear instead of relying on a blind one-shot timeout.
5. If the hash marker is present, the tab uses a per-tab `sessionStorage` key to avoid duplicate runs.
6. Once the target page is ready, the tab runs the existing Vista Ligera generation flow for that search result page.
7. After launching Vista Ligera, the search tab closes itself so only the result tab stays open.
8. Temporary state is kept local to the tab and not shared across other tabs.
9. Favorite rows can be edited or removed directly from the modal, with basic validation on the edited name.

## Invariants
- Each job must be namespaced so one item cannot overwrite another item’s state.
- Shared favorite storage must remain local-only in `chrome.storage.local`.
- Batch launch state should stay per-tab so parallel search tabs do not overwrite each other.
- Fixed delays are allowed only as a fallback, not as the primary readiness signal.
- Favorite data should be local-only for the first version.
- Batch tabs must use per-tab `sessionStorage` keys so retries in the same tab do not re-run the generator.

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

## Edit Impact Checklist
- If tab orchestration changes, review `features/f07-ui-panel-actions.md`.
- If saved product data shape changes, review `features/f02-badges-price-extraction.md` and `features/f08-utils-and-normalization.md`.
- If the generated output changes, review `features/f06-vista-ligera-rendering.md`.
- Manual checks: save favorite, run one item, run many items, reload mid-flow, open a second job while the first is active.