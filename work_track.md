- run code locally
- Audit current implementation of the code and identify any potential issues or areas for improvement. - done
- Audit results show
  no offlien cache for products exist,

- Missing fucntionalities:
  - Offline cache for products, categories and tags
  - Offline sync for products, categories and tags
  - Conflict resolution for products, categories and tags
  - Websocket reconnection/backoff
  - Outbox for offline updates to be sent to the server when back online
  - Place order missing from the app, need to implement
  - Add to cart no ui/ ux on mobile

- Code and env issues,
  - Expo app crshing in android, need to fix, emulator image issues discovered and fixed, also app orientation updated

- Fixing lifecycle issues ,

* Fixed AppState listener leak that could accumulate during long POS sessions.
* Fixed WebSocket cleanup so old socket connections don’t remain after unmount.
* Fixed stale WebSocket callbacks so the latest handler is always used.
* Fixed sync polling timer leak by properly clearing intervals.
* Stabilized Products screen callbacks; no offline/realtime/conflict features implemented yet.

- Added full socket flow , now manually testing if we are receving latest products and updates from the server, and if the app is sending updates to the server when products are updated in the app.

- Question: How wil lapp know how many new products we updated since our app went offline.?
  A: last sync system,
  But thinking if this can fail in cases!!
  Yes last sync system has drawbacks, ideally our backend could have had a tiemstamp based system!
-

- Fixed  orders and cart bugs n prod details

- Now need to implement offline cache and sync for products, categories and tags, and also implement conflict resolution for products, categories and tags.
// I can already htink of points of failure,  eg: if losts of data is out of syn and user sleects a prod and places order,

we might need a strategy to get a quick list of products that may haev stale values, and then before user goes to description of the porduct we need to get latest data,


- 