- run caode locally

## /sync limitation: no global sync cursor

- `GET /sync?since=` does not use a global sync cursor — `since` is compared against independent,
  per-entity version numbers.
- Using the highest/max version seen as the sync position is unsafe: it can miss changes to
  entities that have a lower version.
- The mobile implementation uses a conservative minimum-version sync floor to prioritize
  correctness and avoid missed updates.
- Trade-off: this can over-fetch already-known changes, especially as the catalog grows.
- For a production-scale backend, I'd prefer a server-issued globally monotonic change
  cursor/sequence (or an appropriate server-side timestamp/change-feed mechanism), allowing
  efficient incremental sync without this ambiguity.
- Backend was intentionally not modified — out of scope for this assessment.

## Bug fix: Product Detail showed "Product not found"

- Root cause: the screen called `GET /products/:id`, which the backend never registers (only
  `GET /products` list and `POST /products/:id/bump` exist) — every request 404'd.
- Fix: Product Detail now reads the product straight from `productStore` (a Zustand selector on
  `products`), which already owns the catalog and is kept live by WS/`/sync`. No new fetch, no
  second source of truth, and a version bump now reflects on the detail screen automatically.

## Bug fix: created order missing from Orders

- Root cause: `POST /orders` + `GET /orders?device_id=` work correctly (verified directly against
  the running backend). The Orders screen only fetched once, on mount — Expo Router keeps tab
  screens mounted after their first visit, so an order created after Orders was first shown never
  triggered a refetch, leaving the list stuck on a stale "No orders yet".
- Fix: Orders now refetches via `useFocusEffect` every time the tab regains focus, so returning
  from Cart after placing an order shows it. `order/[id]` had the same device-scoping gap as the
  earlier audit noted (it called `getOrders()` unscoped) — fixed to filter by device id too.
