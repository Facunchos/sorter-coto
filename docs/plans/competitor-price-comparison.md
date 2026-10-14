# "Comparar Carrito" + Precio Real — How it works

Status: **implemented** (base `release/3.5.10`). Scope: cart page (`/carrito`) only.
Competitors (MVP): **Carrefour** + **Día**. Vea/Jumbo deferred (sucursal-dependent prices).

## Files

| File | Role |
|---|---|
| `bg.js` | Background service worker: all cross-origin fetches, VTEX adapters + promo math, fetch pool, Port streaming, permission request, `tabs.create` |
| `src/priceCompare.js` | Content module: cart DOM scan, EAN + Precio Real resolution (Constructor.io), tiles, totals, progress bar, Port client |
| `src/ui.js` | Panel button **"Comparar Carrito"** (`createComparearButton`, between Vista Ligera and Ordenar) |
| `content.js` | Calls `priceCompare.init()` in `init()` |
| `manifest.json` | `background.service_worker`, `optional_host_permissions` (ac.cnstrc.com, carrefour.com.ar, diaonline.supermercadosdia.com.ar) |
| `styles.css` | Section "Comparar Precios con Competencia + Precio Real del Carrito" |

## Precio Real (automatic, zero permissions)

1. On `/carrito`, scan `div.c__item-product[data-cnstrc-item-id]` (desktop + mobile copies are
   deduped by item id). Item id is `prod` + zero-padded PLU (`prod00574450` → PLU `574450`);
   quantity from `input#input-prod…`.
2. Per item, resolve via Constructor.io **from the content script** (API sends
   `Access-Control-Allow-Origin: *`, so no host permissions needed): try
   `search/{PLU}?key=…&section=Products` → `search/{name}` → `item/{id}`.
3. Record fields: `product_main_ean` (number), `product_list_price`, `discounts[0].{discountPrice,
   discountText}`. **Real final price = `discountPrice` if present, else `product_list_price`.**
4. Render "Precio real: $X" (green, with promo chip like `50%Dto`) under "Precio regular", and a
   **"Total real"** chip next to both cart totals (`div.total-precio` and the bottom
   `h4 > span.color-primary`) = Σ(real price × qty). Tooltip carries the promo caveat
   (tope / medios de pago).
5. Unresolvable items show "no disponible" and are **not** retried (`failed` flag); results are
   cached in-page; DOM mutations and qty `change` events refresh state.

## Comparar Carrito (button click)

1. Button is grey with tooltip "Clickeame cuando estes en el carrito"; **turns Coto-red on the
   cart page**. Off-cart click → toast "Abrí el carrito para comparar precios".
2. Click → tiles (`Carrefour` / `Día` badges) appear in each card → Port `compare` to `bg.js` →
   first run sends `need-permission` → `chrome.permissions.request()` (one-time prompt) → batch runs.
3. Background streams `{type:"result", productId, store, data}` per fetch; tiles fill in
   progressively with **effective price** + optional yellow promo chip; **green** if lower than
   Coto's real price, **red** if higher; "sin datos"/"no disponible"/"error" states otherwise.
4. Tile click → `bg.js` validates the URL (https + host allowlist) → `tabs.create` opens the
   competitor PDP (`product.link` from the VTEX API — never the `/EAN` URL, those are search pages).

## Vista Ligera comparison (live relay, no blocking)

The VL page is a `blob:` document without `chrome.runtime`, but it is **same-origin with the opener
tab**, so the content script drives everything directly through `vlWindow.document` (no inline
scripts in the VL page → no CSP risk):

1. "Generar Vista Ligera" starts the EAN+competitor prefetch immediately (pipelined per scrape
   batch) — the VL **opens without waiting** for comparison results.
2. Cards render placeholder compare rows (`data-cmp-id` on the row, `data-store` on each tile) plus
   a header button **"Comparar con competencia"** (`#vl-compare-btn`, hidden in print/PDF mode).
3. `comparePrep` streams batches through `bg.js` (one Port per flush) and paints each result into
   the VL DOM as it arrives: "Precio real" line, green/red tiles vs that price, yellow promo chip,
   click-through to the competitor PDP.
4. The button re-runs the comparison on demand (bg's 30-min cache makes repeats near-instant) and
   reflects state ("Comparando…" / "Comparado ✓" / "Sin datos para comparar").

## Competitor adapters (VTEX)

`GET {host}/api/catalog_system/pub/products/search/?fq=alternateIds_Ean:{ean}` →
`items[].sellers[0].commertialOffer.{Price,ListPrice,PriceWithoutDiscount,IsAvailable}` + `Teasers`
(+ `discountHighlights`). ListPrice is unreliable as "list" — a missing/discounted price falls back
through `PriceWithoutDiscount`.

**Batching (verified against the live APIs):** up to 10 EANs per request using **repeated** `fq`
params (`?fq=alternateIds_Ean:e1&fq=alternateIds_Ean:e2&…`). The comma-OR form
(`fq=alternateIds_Ean:e1,e2`) does **not** work on these stores (returns a single product) and must
not be used. EAN matching normalizes leading zeros (live data returns GTIN-14 like
`07799155000197`; `product.ean` is often undefined — the EAN lives in `items[].ean`). Any EAN the
batch misses is retried with the single-EAN query (the proven 4.1.1 shape), so batching is an
optimization and never a correctness dependency.

**Promo math** (the stores disagree on what they display, so we compute an effective unit price):

| Teaser text | Effective price | Example (verified) |
|---|---|---|
| `3x2` / `N x M` | `price × M/N` | Día Clight $625 × 2/3 = **$416,67** |
| `2DO AL X%` | `price × (2 − X/100)/2` | Carrefour water $3.046,15 × 0.65 = **$1.980,00** |
| `2da unidad al X%` | same as above | — |
| `X% Dto` | `price × (1 − X/100)` | — |

Guard: teaser math applies **only when `Price >= ListPrice`** (no inline discount), so prices the
store already reduced (e.g. Carrefour showing $1.980 as `Price`) are never double-discounted.
Promo sources: `product.discountHighlights[].name` + all short strings inside `offer.Teasers`
(VTEX backing-field quirk handled by generic string collection).

## Fetch policy (`bg.js`)

Pool: global concurrency **6**, per-domain **3** + 200 ms spacing, 10 s timeout (AbortController),
2 retries with backoff + jitter (network/429/5xx, honors Retry-After), circuit breaker after 5
consecutive failures per domain (60 s), `credentials:"omit"`, `cache:"no-store"`. Successful
results cached in `chrome.storage.session` for 30 min (re-clicks are instant). A fresh batch
aborts the previous one; `safePost` guards against disconnected ports.

## Packaging (manifest differs per browser)

Chrome rejects `background.scripts` (`requires manifest version of 2 or lower`); Firefox has no
`background.service_worker`. `manifest.json` keeps `service_worker` (Chrome); the README packaging
script emits **two zips** (`-chrome.zip`, `-firefox.zip`), swapping only the `background` key for
Firefox (`"scripts": ["bg.js"]`). The package file list must include `bg.js`.

## Store compliance

List the three fetched domains in the CWS + AMO listings (AMO §6 disclosure; scraped data counts
as "web browsing activity" under CWS Limited Use). No remote code; extraction logic is bundled.
Gecko `data_collection_permissions` stays `"none"` (no user data leaves the machine — the extension
talks only to the public price APIs).

## Known limits / tuning knobs

- Throughput: `CFG.globalConcurrency`, `CFG.perDomainConcurrency`, `CFG.perDomainSpacingMs` in
  `bg.js`. No published rate limits on the VTEX catalog endpoints; Carrefour sits behind
  Cloudflare, so the circuit breaker is the safety net.
- Promo parsing is heuristic (patterns above); unknown teaser shapes fall back to the plain price.
- Comparison of Coto's side uses Constructor `discountPrice` (advertised promo price; caps/payment
  conditions are not modeled — disclaimer is in the tooltips).
- Vea/Jumbo need a Cencosud adapter (`product_search/?query={ean}&map=ft`, `ListPrice` is bogus)
  and a sucursal-price policy before enabling.
