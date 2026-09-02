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
