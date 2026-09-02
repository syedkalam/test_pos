- run code locally
- Audit current implementation of the code and identify any potential issues or areas for improvement. - done
- Audit results show
  no offlien cache for products exist,

- Code and env issues,
  - Expo app crshing in android, need to fix, emulator image issues discovered and fixed, also app orientation updated

- Fixing lifecycle issues ,

* Fixed AppState listener leak that could accumulate during long POS sessions.
* Fixed WebSocket cleanup so old socket connections don’t remain after unmount.
* Fixed stale WebSocket callbacks so the latest handler is always used.
* Fixed sync polling timer leak by properly clearing intervals.
* Stabilized Products screen callbacks; no offline/realtime/conflict features implemented yet.

-
