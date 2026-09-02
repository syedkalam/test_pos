# Native Module Challenges (Bonus)

These are optional advanced challenges worth bonus points.

## Android — SyncBackgroundTask (Kotlin)

The store tablets must continue syncing product versions even when the app is in the background or has been killed by the OS.

Implement a WorkManager `PeriodicWorkRequest` that:
- Runs every 15 minutes (minimum interval enforced by WorkManager)
- Calls the `/sync` endpoint with the last known version
- Persists the updated version to SharedPreferences
- Is registered on app launch and survives app kill / device restart

Skeleton: `native/android/SyncBackgroundTask.kt`

## iOS — RNKeepAliveManager (Objective-C)

Store tablets should not go to sleep during operating hours.

Implement a React Native native module in Objective-C that:
- Exposes `enable()` and `disable()` methods to JavaScript
- Uses `[UIApplication sharedApplication].idleTimerDisabled` to prevent the screen from sleeping
- Is importable in JS as `import { NativeModules } from 'react-native'`

Skeleton: `native/ios/RNKeepAliveManager.m`
