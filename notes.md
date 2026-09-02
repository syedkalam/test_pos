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

## Offline catalog cache

- Persisted: `products`, `categories`, `tags` arrays to AsyncStorage (`surat_catalog_cache_v1`).
  The sync floor is not persisted separately — it's recomputed from the cached entities on
  hydration, so there's one source of truth for it, not two.
- Startup: hydrate cache first and render it immediately if present, then run a silent
  `syncSince()` catch-up in the background (no full reload). No cache (first install) falls back
  to the normal full load.
- Recovery: reuses the existing Task 3 sync flow as-is (WS reconnect / foreground / online), so
  there's a single refresh path whether it's triggered by cache hydration or reconnection. WS/
  sync updates also refresh the persisted cache.
- Trade-off: writes are debounced (~1.5s) so a burst of WS bumps collapses into one write instead
  of one per bump. If the app is killed inside that window, the last update(s) may not be on disk
  yet — acceptable, since `syncSince()` re-fetches anything missed on next launch/reconnect.

## Offline bump outbox + conflict resolution

- Persistent outbox: a product/category/tag bump made while offline (or when the request just
  fails) is queued to AsyncStorage (`surat_outbox_v1`), written immediately (not debounced, unlike
  the catalog cache) so an app kill right after tapping bump doesn't lose the pending intent.
- Optimistic: the local version increments immediately for a responsive UI, whether online or
  offline; the network attempt (or later replay) only ever reconciles that value, never
  double-increments it.
- Conflict strategy: server-authoritative + operation replay. A 409 means the server's
  `current_version` is truth — the queued bump is retried against that version, not discarded, so
  Device A's offline bump (v3) survives Device B racing ahead to v6 and still lands, ending at v7.
- Why: a bump is a stateless "+1" operation, not a value to set, so replaying it against whatever
  the server says is current is always safe and never loses user intent — simpler and more
  faithful than trying to merge/rebase a value-based change.
- Limitation: replay is capped (5 conflict retries per operation) to avoid looping forever under a
  pathological back-to-back conflict storm; an op that exhausts this is rebased and retried on the
  next reconnect instead of being dropped. Cart/order flows are unaffected — only entity bumps are
  queued, as scoped.
