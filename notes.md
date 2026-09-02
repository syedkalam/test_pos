- run caode locally

## mobile/ — lifecycle/resource leak fixes (2026-09-02)

Scope: hooks/useAppState.ts, hooks/useWebSocket.ts, hooks/useSyncPoller.ts, app/(tabs)/index.tsx.
Offline cache, realtime entity sync, conflict resolution, outbox, and background sync are
NOT implemented here — this pass only stops active resource leaks and stabilizes long-running
behavior.

### Confirmed leaks and root causes

1. **`useAppState` — unbounded AppState listener growth.**
   `AppState.addEventListener('change', ...)` was never stored or removed, and the effect's
   dependency array was `[onForeground]`. The caller in `app/(tabs)/index.tsx` passed a new
   inline arrow function on every render, so a new listener was subscribed on every single
   re-render of the Products screen (every keystroke in search, every pagination load, every
   cart update) with no corresponding cleanup. On a POS terminal left running for hours with
   normal search/scroll usage, listener count grows unbounded — each firing extra work on every
   foreground transition — directly contributing to sluggishness and eventual freezes.

2. **`useWebSocket` — socket never closed, stale `onMessage` closure.**
   The effect created a `WebSocket` but never called `.close()` on unmount and had no `onclose`
   handler, so a live socket (and its handlers) could keep running after the owning component
   was gone. `onMessage` was also captured once at mount time (effect deps `[]`), so any change
   to the caller's callback identity was silently ignored — a stale-closure bug. On a POS
   terminal, unmount/remount cycles (screen navigation, Fast Refresh) could leave old sockets
   alive alongside new ones.

3. **`useSyncPoller` — leaked `setInterval`.**
   `setInterval(poll, POLL_INTERVAL_MS)` was never captured or cleared. Because the effect's
   dependency array includes `sinceVersion`, every time that value changed the effect re-ran and
   created a *new* interval on top of the previous (uncleared) one. This hook is not yet wired
   into the app, but the bug would have caused duplicate `/sync` polling requests and accelerating
   CPU/network use the longer a session ran, immediately upon integration.

### Fixes made

1. `useAppState`: subscribe once (effect deps `[]`), keep the subscription reference and call
   `subscription.remove()` on cleanup. The latest `onForeground` callback is tracked via a ref
   that's updated on every render, so the subscription itself stays stable while foreground
   detection still calls the current callback. `app/(tabs)/index.tsx` also now wraps its
   foreground callback in `useCallback` to avoid unnecessary churn at the call site.

2. `useWebSocket`: added an `isActive` flag plus a cleanup function that sets it `false`, clears
   `wsRef.current`, and calls `ws.close()` on unmount, so handlers can't act after teardown. The
   `onMessage` callback is now tracked via a ref (updated every render) so `ws.onmessage` always
   invokes the latest callback instead of a stale one. No reconnect/backoff logic was added — out
   of scope for this task. `app/(tabs)/index.tsx` wraps its sync-event callback in `useCallback`
   as well.

3. `useSyncPoller`: capture the interval id from `setInterval` and clear it in the effect's
   cleanup function, so a change in `sinceVersion` (or an unmount) tears down the previous
   interval before a new one starts. Polling behavior (immediate poll + interval poll) is
   unchanged. Still not wired into the app — that remains a separate task.

### Why this matters for long-running POS terminals

POS terminal apps are expected to stay open and in the foreground for entire shifts (potentially
days between restarts), and the audited symptoms ("devices occasionally freeze", "app becomes
sluggish after hours of uptime") are exactly the failure mode of accumulating listeners/timers
that are never released — memory and per-event work both grow monotonically with uptime and
usage instead of staying flat. Fixing subscription/socket/timer lifecycles is a prerequisite for
any of the later sync/offline work, since that work will add more listeners, sockets, and timers
on top of this foundation.

### Tests performed

- `npx tsc --noEmit` — passed with no errors.
- No ESLint or test scripts exist in mobile/package.json (only `start`, `android`, `ios`) — none
  were available to run.
- `npx expo export --platform ios` — full production bundle succeeded (929 modules, no bundling
  or resolution errors), confirming all edited files and every screen still compile and wire
  together correctly.
- No physical device/simulator was available in this environment, so live navigation
  (mount/unmount/remount cycles) and runtime inspection of listener/socket counts were not
  performed — verification here is limited to static type-checking and successful bundling, not
  an observed runtime confirmation.
