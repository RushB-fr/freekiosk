# Changelog


All notable changes to FreeKiosk will be documented in this file.


The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

***


## [Unreleased]

### Fixed
- 🔐 **MQTT password field adding extra characters**: Removed custom bullet-masking logic in `SettingsInput` and replaced with native `secureTextEntry` — same fix as PinInput (v1.2.5). Custom masking reconstructed the real value from display text lengths, which broke with Samsung/Gboard predictive text, autocorrect, and paste, silently injecting extra characters. Affects MQTT password, API key, and all other password fields using `SettingsInput`.

***

## [1.2.14] - 2026-02-23

### Added
- 🔌 **MQTT Configuration via ADB intents**: Configure all MQTT settings headlessly for automated tablet provisioning
  - 11 parameters supported: `mqtt_enabled`, `mqtt_broker_url`, `mqtt_port`, `mqtt_username`, `mqtt_password`, `mqtt_client_id`, `mqtt_base_topic`, `mqtt_discovery_prefix`, `mqtt_status_interval`, `mqtt_allow_control`, `mqtt_device_name`
  - MQTT password stored securely in Android Keychain, same pattern as PIN
  - Example usage:
    ```bash
    adb shell am start -n com.freekiosk/.MainActivity \
        --es mqtt_enabled "true" \
        --es mqtt_broker_url "broker.local" \
        --es mqtt_port "1883" \
        --es mqtt_username "user" \
        --es mqtt_password "pass"
    ```
- 🔒 **TLS/SSL MQTT support**: New `useTls` config option — auto-enabled when port is 8883
- 🔔 **MQTT connection errors surfaced to UI**: Broker errors (e.g. `NOT_AUTHORIZED`) now propagate from native Kotlin → JS → Settings UI — no more silent failures
- 💾 **Password saved hint**: Shows "Password is saved" when a password is already configured, preventing accidental overwrites

### Fixed
- 🔄 **MQTT reconnect losing credentials**: HiveMQ's `automaticReconnect()` was sending `null` username/password on reconnection, causing the broker to reject with `NOT_AUTHORIZED`. Replaced with manual reconnect that always sends full credentials, with exponential backoff (1s → 30s)
- 🏗️ **Release build crash (R8/ProGuard)**: R8 obfuscation was renaming Netty/JCTools fields used via `Unsafe.objectFieldOffset()` reflection, causing `ExceptionInInitializerError` on startup in release builds. Added official HiveMQ ProGuard rules (`-keepclassmembernames`)
- 📋 **Password paste truncated to one character**: MQTT password field was incorrectly capturing only the last character on paste (`slice(-1)` → `slice(-charsAdded)`)
- ⌨️ **Broker URL keyboard adding spaces after dots**: Fixed by setting `keyboardType="url"` on the broker URL input
- 🔁 **Connect button ALREADY_RUNNING error**: `handleConnect` now stops the existing MQTT client before starting a new one
- 🔄 **External App Mode: child activities no longer killed by auto-relaunch** (#69): barcode scanners, file pickers, camera intents, and other child activities launched by the locked app are now properly detected and allowed
  - Uses `ActivityManager.runningAppProcesses` to check if the locked app's process is still alive (not crashed) — if alive and foreground is not a launcher, it's a child activity
  - Launchers (Home screen) are dynamically detected via `PackageManager.queryIntentActivities(ACTION_MAIN, CATEGORY_HOME)` — works on all OEMs without hardcoding
  - Safe in Lock Task mode: user cannot open other apps, only the locked app can launch child activities
  - Logic: launcher detected → relaunch FreeKiosk; locked app process alive → allow child activity; process dead → relaunch FreeKiosk
  - Fixes use cases: MLKit barcode scanner, camera intents, file pickers, permission dialogs, any native modal launched by the locked app
- 🚀 **External App Mode boot: REST API now starts automatically**: When FreeKiosk is set as default launcher in External App Mode, `HomeActivity` now also starts `MainActivity` in background
  - Ensures REST API server, MQTT, and other services are running even when an external app is in foreground
  - `MainActivity` automatically moves to background (`moveTaskToBack`) when started from `HomeActivity`
  - Fixes issue where the external app would start but FreeKiosk's API server wouldn't be accessible

***

## [1.2.13] - 2026-02-20

### Added
- 📡 **MQTT + Home Assistant Auto-Discovery**: Native MQTT client with full HA integration
  - **27 auto-discovered entities** in Home Assistant via MQTT Discovery protocol
  - **11 sensors**: Battery level, brightness, WiFi SSID, WiFi signal, light sensor, IP address, app version, memory used, storage free, current URL, volume
  - **6 binary sensors**: Screen on/off, screensaver active, battery charging, kiosk mode, device owner, motion detected
  - **2 number controls**: Brightness (0-100%), volume (0-100%) — adjustable sliders in HA
  - **2 switches**: Screen power (ON/OFF), screensaver (ON/OFF)
  - **5 buttons**: Reload, wake, reboot, clear cache, lock
  - **1 text entity**: Navigate URL — send a URL to load in the WebView
  - **20 additional commands** via MQTT: TTS, toast, audio play/stop/beep, launch app, execute JS, URL rotation start/stop, restart UI
  - **Push-based status**: Periodic state publishing (configurable 5-3600 seconds, default 30s)
  - **LWT (Last Will & Testament)**: Automatic availability tracking — HA shows device as unavailable on disconnect
  - **Auto-reconnect**: Handles WiFi drops and broker restarts with automatic re-publishing of all discovery configs
  - **Always-on Motion Detection**: Configurable option to run camera-based motion detection continuously (not just during screensaver)
  - **Full command parity** with REST API — both interfaces dispatch through the same command handler
  - **Concurrent operation**: MQTT and REST API can run simultaneously
  - Eclipse Paho MQTT v3.1.1 with secure password storage (Android Keychain)
  - Settings: Broker URL, port, username, password, client ID, base topic, discovery prefix, status interval, allow control
  - Connection status indicator in Settings UI
  - MQTT settings included in backup/restore
  - **[Full MQTT Documentation](docs/MQTT.md)**
### Fixed
- 🔊 **No audio in Lock Mode on Samsung/OneUI devices**: audio streams were muted by Samsung when `LOCK_TASK_FEATURE_NONE` was set, which is more restrictive than Android's own default behavior
  - `LOCK_TASK_FEATURE_GLOBAL_ACTIONS` is now included by default (matches Android's own default when `setLockTaskFeatures()` is never called), preventing Samsung/OneUI from muting audio in `LOCK_TASK_MODE_LOCKED`
  - Added `AudioManager` safety net: after entering lock task mode, `setMasterVolumeMuted(false)` is called followed by `ADJUST_UNMUTE` on all audio streams (MUSIC, NOTIFICATION, ALARM, RING)
  - **Settings UI change**: "Allow Power Menu" toggle renamed to "🔌 Block Power Menu" with inverted logic — power menu is now **allowed by default**, admin can explicitly block it if needed
  - **No migration required**: same storage key `@kiosk_allow_power_button` — existing user settings preserved; only new installs benefit from the new default
  - Applied consistently across `KioskModule.kt`, `MainActivity.kt`, and `AppLauncherModule.kt`
- 🔧 **Camera/Microphone not working in WebView on Fire OS** (Echo Show, Fire tablets) (#63): auto-grant WebView media/geolocation permissions in kiosk mode — OS-level permission via `pm grant` still required


***

## [1.2.12] - 2026-02-18

### Added
- 🔒 **Screen lock without Device Owner**: `screen/off` and `lock` now work with Device Admin or AccessibilityService
  - 4-tier fallback: Device Owner `lockNow()` → **Device Admin `lockNow()`** → AccessibilityService `GLOBAL_ACTION_LOCK_SCREEN` (API 28+) → dim brightness to 0
  - `dpm.lockNow()` is available to Device Admin apps (API 8+), not just Device Owner — was an oversight
  - Enables full FreeKiosk screen control when another MDM already holds Device Owner
  - Truly turns off the screen (hardware off) with any of the 3 first tiers
  - Wake-up cycle (`screen/on`, AlarmManager, WakeLock) unchanged and fully compatible
  - `/api/lock` and `screen/off` response now includes `"method"` field (`"DeviceOwner"`, `"DeviceAdmin"`, or `"AccessibilityService"`)

- **Inline PDF Viewer**: PDFs now open directly in-app via a bundled PDF.js viewer instead of being downloaded
  - Enabled via a toggle in **Settings → General → PDF Viewer**
  - Uses **PDF.js v3.11.174** bundled locally in Android assets — no Google Docs, no external service
  - Full viewer UI: page navigation (◀/▶), zoom (−/⊡/+), close (✕), and download (⬇) buttons
  - **Download button** triggers the native Android `DownloadManager` (notification + Downloads folder)
  - Intercepts PDF links at 3 levels:
    1. **JS injection**: strips `<a download>` attributes so Android's DownloadListener doesn't fire early
    2. **`onShouldStartLoadWithRequest`**: redirects `.pdf` URLs and Google redirect URLs (`google.com/url?url=...`) to the viewer
    3. **Native `DownloadListener` patch** (`RNCWebViewManagerImpl.kt`): intercepts PDFs detected by `Content-Type: application/pdf` or `Content-Disposition: attachment` and loads the viewer instead of downloading
  - **Native HTTP proxy** (`RNCWebViewClient.java` `shouldInterceptRequest`): when the viewer is active, proxies all remote PDF XHR requests via `HttpURLConnection` to bypass CORS restrictions — cookies and `Range` headers forwarded
  - Security: `allowFileAccess` / `allowUniversalAccessFromFileURLs` only enabled when PDF viewer is on
  - All patches saved in `patches/react-native-webview+13.16.0.patch` via `patch-package`

- ♿ **AccessibilityService for cross-app key injection**: New `FreeKioskAccessibilityService` enables keyboard emulation in External App mode
  - Uses `performGlobalAction()` for Back/Home/Recents/PlayPause navigation (all Android versions)
  - Uses `InputMethod.sendKeyEvent()` / `commitText()` for keys and text on Android 13+ (API 33+)
  - **DPAD navigation fallback** (all Android versions): spatial focus traversal via accessibility tree,
    `ACTION_CLICK` for select, `ACTION_SCROLL_FORWARD/BACKWARD` for scrolling
  - **Play/Pause** mapped to `GLOBAL_ACTION_KEYCODE_HEADSETHOOK` (Android 12+)
  - Fallback for Android 5–12: `ACTION_SET_TEXT` injects printable characters, text, Backspace, and Shift+letter
  - `KeyCharacterMap` converts keyCodes to printable characters for the ACTION_SET_TEXT fallback
  - 5-tier fallback chain: globalAction → InputMethod → a11y navigation → ACTION_SET_TEXT → `input keyevent`
  - **Settings UI**: New "Accessibility Service" section in Advanced Settings with:
    - Status indicator (Active / Enabled / Disabled)
    - "Open Accessibility Settings" button to launch Android's settings
    - "Enable Automatically" button for Device Owner mode (no user interaction needed)
    - Info box explaining why the service is needed
  - Compatible with privacy ROMs (e/OS, LineageOS, CalyxOS, GrapheneOS) where `Instrumentation` is blocked

### Fixed
- 🔑 **Key injection compatibility fix**: Replaced `Instrumentation.sendKeyDownUpSync()` with `activity.dispatchKeyEvent()` across all remote/keyboard endpoints
  - `Instrumentation` requires `INJECT_EVENTS` (signature-level permission) which privacy-focused ROMs (e/OS, LineageOS, CalyxOS, GrapheneOS) block
  - `dispatchKeyEvent()` dispatches directly into the Activity's View hierarchy — no special permission needed
  - Affects: `/api/remote/*` (all 9 keys), `/api/remote/keyboard/{key}`, `/api/remote/keyboard?map=...`, `/api/remote/text`
  - Also fixed in `KioskModule.sendRemoteKey()` (used by JS-side remote control)
  - No regression on standard ROMs (Samsung, Pixel, AOSP)


***

## [1.2.11] - 2026-02-16

### Added
- ⌨️ **Keyboard Emulation API**: Full keyboard input simulation via REST API ([#keyboard](https://github.com/FreeKiosk/FreeKiosk/issues))
  - **Single key press** (`GET|POST /api/remote/keyboard/{key}`): Send any keyboard key
    - Supports: a-z, 0-9, F1-F12, space, tab, enter, escape, backspace, delete, arrows, symbols, media keys
    - Over 80 named keys + single character support
  - **Keyboard shortcuts** (`GET|POST /api/remote/keyboard?map=ctrl+c`): Send key combinations with modifiers
    - Supports: ctrl, alt, shift, meta (Windows/Cmd key)
    - Examples: `ctrl+c`, `ctrl+v`, `alt+f4`, `ctrl+shift+a`
  - **Text input** (`POST /api/remote/text`): Type full text strings into focused input fields
    - Body: `{"text": "Hello World!"}`
    - Uses `Instrumentation.sendStringSync()` for natural text input
  - All keyboard operations handled natively (no JS bridge — fast and reliable)
- 📍 **GPS Location API** (`GET /api/location`): New endpoint for device GPS coordinates
  - Returns: latitude, longitude, accuracy, altitude, speed, bearing, provider, timestamp
  - Uses GPS, Network, and Passive location providers (best accuracy wins)
  - Permissions already declared in manifest (`ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`)
- 🔋 **Enriched Battery API**: `GET /api/battery` now returns additional data
  - New fields: `temperature` (°C), `voltage` (V), `health` (good/overheat/dead/etc.), `technology` (Li-ion/etc.)
  - Backward compatible: existing `level`, `charging`, `plugged` fields unchanged
- 🔒 **Lock Device API** (`GET|POST /api/lock`): New endpoint to lock the device screen
  - Uses `DevicePolicyManager.lockNow()` for a true screen lock (Device Owner required)
  - Returns clear error message if Device Owner mode is not active
- 🔄 **Restart UI API** (`GET|POST /api/restart-ui`): New endpoint to restart the app UI
  - Calls `activity.recreate()` to fully restart the React Native activity
  - Useful for remote troubleshooting without rebooting the device
- 🗣️ **Text-to-Speech (TTS)**: Fully implemented native TTS via Android `TextToSpeech` engine
  - TTS engine is initialized when the HTTP server starts
  - Handled natively (no JS bridge dependency — works even if React Native is unresponsive)
  - Auto-retries if TTS engine is not ready on first call
- 📊 **Volume Read API** (`GET /api/volume`): New endpoint to read current volume level
  - Returns `{ level: 0-100, maxLevel: 100 }` for easy integration with Home Assistant sensors

### Fixed
- 🐛 **Screen Sleep Scheduler - Black Screen & Navigation Lockout**: Fixed 4 critical bugs causing scheduler to malfunction
  - **Feedback loop**: Scheduler re-entered sleep immediately after wake due to `isScheduledSleep` in useEffect dependency array
  - **Navigation lockout**: Scheduler interval kept running while on PIN/Settings screen, calling `lockNow()` and locking user out
  - **Wake-on-touch broken**: Touch events during sleep did nothing — never restored brightness or called `exitScheduledSleep()`
  - **Stale closure**: `checkScreenSchedule()` used outdated state variable instead of ref
  - **N-tap during sleep**: 5-tap for settings now properly exits scheduled sleep before navigating to PIN
  - **Activity null after lockNow()**: `turnScreenOn()` now acquires WakeLock before checking for activity availability
  - Fixes black screen issue on Android 8.1+ and impossible settings access during sleep windows
- 🐛 **Power menu dismissed immediately on some devices (TECNO/HiOS)**: Fixed GlobalActions (power menu) being closed ~900ms after appearing when "Allow Power Button" is enabled in Lock Mode
  - Root cause: `onWindowFocusChanged` aggressively re-applied immersive mode, stealing focus back from the system power menu window
  - Additionally, `onResume` would re-trigger `startLockTask()` during the brief focus transition, compounding the issue
  - Fix: debounced `hideSystemUI()` by 600ms on focus regain, and deferred `startLockTask()` re-lock when power button is allowed and focus was recently lost
  - No security impact: Lock Task Mode remains fully active throughout — only the cosmetic immersive mode re-application is delayed
  - Affects TECNO, Infinix, itel (HiOS) and potentially other OEMs with aggressive WindowManager behavior on Android 14+
- 🐛 **Device Owner Status Hardcoded `false` in API**: Fixed `/api/info` and `/api/status` always reporting `isDeviceOwner: false`
  - Was hardcoded to `false` in `HttpServerModule.getDeviceStatus()`
  - Now performs a real `DevicePolicyManager.isDeviceOwnerApp()` check
  - This caused external dashboards to incorrectly show Device Owner as inactive
- 📺 **Screen On Not Working After lockNow()**: Fixed `GET /api/screen/on` failing when screen was off
  - `reactContext.currentActivity` was `null` after `lockNow()` and the code silently did nothing
  - WakeLock is now acquired **before** checking for activity (WakeLock works without activity)
  - Added keyguard dismissal to properly wake from locked state
  - Screen now reliably turns on whether activity is available or not
- 🧹 **Clear Cache Now Actually Clears**: Fixed `/api/clearCache` which only reloaded the WebView
  - Now performs a full native cache clear: WebView HTTP cache, cookies, Web Storage (localStorage/sessionStorage), form data
  - Then forces a WebView remount on the JS side for a complete fresh start
- 🔄 **In-App Update 404 Error**: Fixed update download failing with 404 error
  - Now retrieves actual APK download URL from GitHub release assets instead of constructing it
  - Eliminates filename case sensitivity issues (FreeKiosk vs freeKiosk)
  - More robust: works regardless of APK naming convention changes
  - Fallback to constructed URL if asset parsing fails
- 📸 **Screenshot Race Condition**: Fixed `/api/screenshot` returning 503 intermittently
  - Replaced `Thread.sleep(100)` with a proper `CountDownLatch` to wait for the UI thread
  - Screenshot capture now waits up to 5 seconds for the UI thread to complete

***

## [1.2.10] - 2026-02-11

### Added
- ⏱️ **Inactivity Return - Scroll to Top Toggle**: New optional behavior for when already on start page
  - Added "Scroll to Top on Start Page" toggle (enabled by default)
  - When enabled and already on start page, smoothly scrolls to top instead of doing nothing
- 🔗 **URL Filtering (Blacklist / Whitelist)**: Control which URLs users can navigate to within the kiosk WebView
  - Choose between **Blacklist** mode (block specific URLs) or **Whitelist** mode (allow only specific URLs)
  - Wildcard pattern support (e.g., `*.example.com/*`, `freekiosk.app/download`)
  - Patterns without protocol are automatically matched with `http://` and `https://`
  - Main kiosk URL is always protected and cannot be blocked
  - Empty whitelist = strictest mode (only main URL allowed)
  - Works with both traditional navigation and SPA/client-side routing (pushState)
  - Optional visual feedback toast when a URL is blocked
  - Popup/new window URLs are also filtered

### Fixed
- 🔗 **URL Filtering - Form Submits and JS Buttons**: Fixed form submissions and JavaScript buttons being blocked in whitelist mode
  - Filter now compares origin + pathname instead of just origin
  - Same-page navigations (query params, hash changes, form submits) are always allowed
  - Trailing slashes are normalized (e.g., `https://example.com` and `https://example.com/` are treated as identical)
  - Only navigation to different pages on the same domain requires whitelist match
- 📡 **NFC Monitoring Fix**: Fixed "flicking back to blue screen" when NFC is enabled in kiosk mode
  - Foreground monitoring detected transient `com.android.nfc` package as a wrong app and triggered a relaunch loop
  - NFC system package is now filtered from monitoring checks only when NFC mode is active
  - No impact on monitoring behavior when NFC is disabled
- 💾 **Backup/Restore Missing Settings**: Fixed 20 settings keys not being included in export/import backups
  - Added missing URL filtering settings (blacklist/whitelist lists and configuration)
  - Added missing screen scheduler, inactivity return, blocking overlays settings
  - Added missing WebView back button, camera position, return-to-settings preferences
  - PIN mode setting now properly backed up and restored

***

## [1.2.9] - 2026-02-11

### Fixed
- 📱 **Status Bar Rotation Fix**: Fixed custom status bar disappearing after screen rotation in external app mode
  - OverlayService now recreates the status bar overlay after configuration changes
  - MainActivity re-hides Android system bars on rotation to prevent them from reappearing
- 🔧 **Lock Mode "Device Owner not configured" False Warning**: Fixed JS bundle out of sync with native Kotlin module
  - `startLockTask` call in bundled JS had 2 parameters instead of 3 (missing `allowNotifications`)
  - React Native bridge could not match the method signature, causing a silent exception
  - Resulted in false "Device Owner not configured" warning even when Device Owner was properly set
- 🖱️ **5-Tap During Page Load**: Fixed 5-tap not working while WebView is loading or when page fails to load
  - Invisible touch zone in bottom-right corner during loading and error states
  - Tapping it counts as a 5-tap interaction, allowing access to settings even without network
  - Touch zone disappears automatically once the page loads successfully (JS-based detection takes over)

***

## [1.2.8] - 2026-02-10

### Added
- 🖨️ **WebView Print Support**: Native Android printing via `window.print()` interception
  - Supports all connected printers (WiFi, Bluetooth, USB, Cloud Print, PDF)
- 🔗 **URL Filtering (Blacklist / Whitelist)**: Control which URLs users can navigate to
  - Blacklist or Whitelist mode with wildcard pattern support
  - Works with traditional navigation and SPA/client-side routing
- ⬅️ **Back Button Mode via ADB**: `back_button_mode` parameter synced to native SharedPreferences
- ⚠️ **Usage Stats Permission Warning**: Permission check and grant button in Settings

### Fixed
- 🔧 **Back Button Fix**: Fixed back button completely blocked when `test_mode=false`
- 🔀 **ADB Config Fix**: `lock_package` now takes priority over `url` for display mode
-  **Auto Launch on Boot Fix**: Fixed wrong AsyncStorage database name in native Kotlin files
- 🔒 **Settings Buttons Fix**: Lock task temporarily stopped before opening system settings

***

## [1.2.7] - 2026-02-09

### Fixed
- **Navigation Buttons Blocked in Lock Mode**: Fixed navigation buttons (Home, Recents) not being properly blocked in kiosk lock mode
  - Ensured `LOCK_TASK_FEATURE_NONE` correctly blocks all system navigation by default
  - Only `GLOBAL_ACTIONS` (power button) and `NOTIFICATIONS` are conditionally enabled based on user settings
  - Updated `hideSystemUI()` to use modern `WindowInsetsController` API for Android 11+ (API 30+)
  - Added `SYSTEM_UI_FLAG_LOW_PROFILE` fallback for older Android versions

***

## [1.2.6] - 2026-02-09

### Added
- 🔍 **Background App Monitoring**: Auto-relaunch monitoring service for External App mode
  - Automatically detects when locked app exits (crash, timeout, manual close)
  - Brings FreeKiosk back to foreground and relaunches the external app
  - Uses UsageStatsManager for accurate foreground detection (requires Device Owner or manual permission)
  - Monitoring activates when auto-relaunch is enabled in settings
  - Check every 2 seconds in background without impacting performance

### Fixed
- 🚀 **ADB Configuration Kiosk Mode**: Fixed kiosk mode not activating on first launch with `auto_start=true`
  - External app now launches AFTER kiosk mode is properly activated
  - Ensures lock task whitelist includes both FreeKiosk and external app before launch
  - Proper restart sequence: save config → restart FreeKiosk → activate kiosk → launch app
- 📡 **EXTERNAL_APP_LAUNCHED Broadcast**: Improved broadcast reliability for ADB monitoring
  - Now verifies app is in foreground before broadcasting (up to 10 retries over 5 seconds)
  - Adds `verified` boolean to broadcast extras to indicate foreground verification status
  - Consistent behavior whether launched via ADB auto_start or normal app flow
  - Better debugging with detailed logs showing retry attempts and current foreground app
- 🌐 **REST API Reboot Endpoint**: Fixed `/api/reboot` not executing the reboot
  - Reboot now runs natively via `DevicePolicyManager.reboot()` instead of through JS bridge
  - No longer depends on React Native bridge being active (works with screen off)
  - Returns clear error if app is not Device Owner
- 🔀 **REST API Method Handling**: Control endpoints now accept both GET and POST
  - Endpoints without body (`/api/screen/on`, `/api/reboot`, `/api/reload`, etc.) accept GET or POST
  - Endpoints requiring body (`/api/url`, `/api/tts`, `/api/brightness`, etc.) remain POST-only
  - Wrong method on POST-only endpoints now returns 405 "Method Not Allowed" instead of 404 "Not Found"

***

## [1.2.5] - 2026-02-06

### Added
- 📷 **Camera Photo API**: Take photos via REST endpoint using device cameras
  - `GET /api/camera/photo?camera=back&quality=80` - Capture JPEG photo
  - `GET /api/camera/list` - List available cameras with capabilities
  - Supports front and back cameras with configurable JPEG quality (1-100)
  - Auto-exposure and auto-focus warmup for optimal photo quality
  - Optimized resolution (~1.2MP) for fast HTTP transfer
  - Compatible with Home Assistant `camera` platform integration

### Fixed
- 🖼️ **Screensaver API State Separation**: Clarified screen status reporting in REST API
  - GET `/api/screen` now separates physical screen state from screensaver overlay state
  - `"on"`: Reports PHYSICAL screen state via PowerManager.isInteractive (true even if screensaver active)
  - `"screensaverActive"`: Separate boolean indicating if screensaver overlay is showing
  - Allows clients to distinguish: screen physically on vs content visible to user
- 🔢 **Version Reporting**: API now dynamically reads version from BuildConfig instead of hardcoded value
  - Automatically syncs with `versionName` in build.gradle
  - No more manual updates needed when version changes
  - Single source of truth for version information
- 🔐 **PIN Input Stability**: Completely refactored PIN masking system for universal device compatibility
  - Now uses native `secureTextEntry` instead of manual bullet masking
  - Fixes duplicate/random character issues on certain Android devices/keyboards
  - Eliminates input desynchronization problems
  - Adds autocomplete prevention (`autoComplete="off"`, `textContentType="none"`, `importantForAutofill="no"`)

***

## [1.2.4] - 2026-02-05

### Fixed
- 📡 **HTTP Server Screen-Off Availability**: Fixed HTTP server becoming unreachable when screen is off
  - Added `WifiLock (WIFI_MODE_FULL_HIGH_PERF)` to prevent WiFi from sleeping
  - Added `PARTIAL_WAKE_LOCK` to keep CPU active for background HTTP processing
  - Server now remains accessible 24/7 regardless of screen state
  - Locks are automatically released when server stops to preserve battery
- 🔒 **Blocking Overlay**: Bug fixes for blocking overlay display and behavior
- 🔄 **Auto Relaunch External App**: Bug fixes for automatic external app relaunching

***

## [1.2.3] - 2026-01-30

### Added
- 📷 **Motion Detection Camera Selection**: Choose which camera to use for motion detection (front/back)
- 🔘 **Flexible Settings Access Button**: Choose between fixed corner button or tap-anywhere mode for accessing settings
- ⬅️ **WebView Back Button**: Optional back navigation button in WebView for easier browsing
- ☀️ **Auto Brightness**: Automatic brightness adjustment based on ambient light sensor
  - Configurable min/max brightness range

### Changed
- 🔒 **REST API Key Security**: Migrated API key storage from AsyncStorage to Android Keychain (encrypted)
  - Automatic migration from previous versions (backward compatible)
  - Backup/restore fully supports secure API key storage
- 🔐 **Password System**: Enhanced flexibility with optional advanced mode
  - Default: Numeric PIN (4-6 digits) - simple and fast
  - Optional: Advanced Password Mode - enable alphanumeric passwords with letters, numbers, and special characters
  - Toggle in Settings > Password > "Advanced Password Mode"

### Fixed
- 🎨 **Blocking Overlay Display**: Fixed display issues with blocking overlays
- 🔄 **Auto Update System**: Fixed auto-update reliability issues


***
## [1.2.2] - 2026-01-21

### Changed
- 🎯 **5-Tap Detection System**: Complete redesign for fullscreen detection
  - 5-tap now works **anywhere on the screen** (not just on button)
  - Tap 5 times rapidly anywhere to access settings - no more corner targeting required
  - Uses invisible 1x1 pixel overlay with `FLAG_WATCH_OUTSIDE_TOUCH` for fullscreen tap detection
  - Visual indicator is now optional (can be hidden but 5-tap still works everywhere)
  - Underlying app remains 100% interactive (no touch blocking)
  - Removed button position settings (visual indicator fixed in bottom-right when visible)
  - Same behavior in both WebView and External App modes

### Added
- 🔊 **Volume 5-Tap Gesture**: Alternative to 5tap for accessing PIN screen
  - Press Volume Up or Volume Down 5 times quickly to access settings
  - Works even when volume is at max (use Volume Down) or min (use Volume Up)
  - Only active when kiosk mode (lock task) is enabled
  - Toggle in Settings > Security > "Volume 5-Tap"
- 🎨 **Blocking Overlay**: Configurable overlay to block user interactions
  - Touch Logger countdown feature with coordinates display
  - Configurable via settings

### Fixed
- 🖥️ **Screen On/Off API**: Improved reliability for `/api/screen/on` and `/api/screen/off`
  - With Device Owner: uses `lockNow()` to truly turn off screen
  - Without Device Owner: improved brightness control (0 instead of 0.01)
  - Properly manages `FLAG_KEEP_SCREEN_ON` flag
- 🔧 **React Native New Architecture**: Fixed compatibility issues with BroadcastReceivers
- 🐛 **Screensaver Wake**: Fixed screensaver not waking properly after touch or motion detection (stale closure issue)
- 🎨 **Visual Fixes**: 
  - Added cursor visibility in text inputs (cursorColor and selectionColor)
  - Updated "Launch on Boot" info message to apply to all users


***


## [1.2.1] - 2026-01-18

### Added
- 🔌 **ADB Configuration Support**: Headless provisioning via Android Debug Bridge
  - Configure FreeKiosk via command line without UI interaction
  - Set locked app, URL, and all kiosk settings via ADB
  - Auto-restart and launch external app after configuration
  - Support for full JSON configuration or individual parameters
  - [Full ADB Documentation](docs/ADB_CONFIG.md) with examples and scripts
- � **Backup & Restore**: Export and import complete FreeKiosk configuration
  - Export all settings to JSON file
  - Import configuration from JSON file
  - Perfect for device migration and configuration templates
- �🔌 **Allow Power Button option**: New setting in Security tab to allow access to the power menu while in Lock Mode

### Fixed
- 🔧 **REST API Stability**: Improved server reliability and error handling
- 🔧 **Hard restart boot behavior**: Fixed auto-launch issue after hard restart (power + volume buttons hold)
- 🔧 **Database Synchronization**: Fixed data persistence with WAL checkpoint and file sync

### Changed
- 📖 **Documentation**: Updated FAQ for power button behavior and hard restart issues


***


## [1.2.0] - 2026-01-08


### Added
- 🎨 **Complete Settings UI Redesign**: Modern Material Design interface with organized tabs
  - **4 organized tabs**: General, Display, Security, Advanced
  - **Reusable UI components**: SettingsSection, SettingsSwitch, SettingsInput, SettingsRadioGroup, SettingsSlider, SettingsButton, SettingsInfoBox
  - **Centralized theme system**: Colors, Spacing, Typography for consistent styling
  - **Material Design Icons**: Professional vector icons throughout settings

- 🔄 **URL Rotation**: Automatically cycle through multiple URLs at configurable intervals
  - Add/edit/delete URLs with labels
  - Reorder URLs with drag handles
  - Set rotation interval (5+ seconds)
  - REST API support for rotation control

- 📅 **URL Planner**: Schedule URLs based on time and date
  - **Recurring events**: Daily schedules with day-of-week selection
  - **One-time events**: Specific date events for special occasions
  - Set start/end times and priority levels
  - Visual calendar-style management

- 🌐 **REST API Server**: Built-in HTTP server for Home Assistant integration (40+ endpoints)
  
#### Sensor Endpoints (GET)
- `/api/status` - Complete device status in one call
- `/api/battery` - Battery level, charging state, temperature
- `/api/brightness` - Current screen brightness
- `/api/screen` - Screen on/off, screensaver state
- `/api/sensors` - Light sensor, proximity sensor, accelerometer
- `/api/storage` - Storage capacity and usage
- `/api/memory` - RAM capacity and usage
- `/api/wifi` - WiFi status, SSID, signal strength, IP
- `/api/info` - Device model, Android version, app version
- `/api/health` - Simple health check
- `/api/screenshot` - Capture screen as PNG image

#### Control Endpoints (POST)
- `/api/brightness` - Set screen brightness (0-100)
- `/api/screen/on` - Turn screen on
- `/api/screen/off` - Turn screen off
- `/api/screensaver/on` - Activate screensaver
- `/api/screensaver/off` - Deactivate screensaver
- `/api/reload` - Reload WebView
- `/api/url` - Navigate to URL
- `/api/wake` - Wake from screensaver
- `/api/tts` - Text-to-speech
- `/api/volume` - Set media volume
- `/api/toast` - Show toast notification
- `/api/js` - Execute JavaScript in WebView
- `/api/clearCache` - Clear WebView cache
- `/api/app/launch` - Launch external app
- `/api/reboot` - Reboot device (Device Owner mode required)

#### Audio Endpoints (POST)
- `/api/audio/play` - Play audio from URL
- `/api/audio/stop` - Stop audio playback
- `/api/audio/beep` - Play beep sound

#### Remote Control Endpoints (POST) - Android TV
- `/api/remote/up` - D-pad up
- `/api/remote/down` - D-pad down
- `/api/remote/left` - D-pad left
- `/api/remote/right` - D-pad right
- `/api/remote/select` - Select/Enter
- `/api/remote/back` - Back button
- `/api/remote/home` - Home button
- `/api/remote/menu` - Menu button
- `/api/remote/playpause` - Play/Pause

#### API Features
- Optional API Key authentication (X-Api-Key header)
- Configurable port (default: 8080)
- Toggle remote control permissions
- CORS support for web integration
- JSON responses with timestamps

### Documentation
- 📖 New `docs/REST_API.md` with complete endpoint reference
- 🏠 Home Assistant configuration examples
- 🔧 cURL testing examples


***


## [1.1.4] - 2025-12-23


### Added
- 🔄 **In-App Direct Update for Device Owner**: Update FreeKiosk directly from within the app when in Device Owner mode
- 🎨 **Status Bar Item Selection**: New settings to show/hide individual items (Home button, Time, Battery, WiFi, Bluetooth, Sound) in the status bar
- 🧪 **Test Mode Options for External App**: Three options available
  - **Test Mode**: Enable back button to return to FreeKiosk (default for safety)
  - **Immediate Return**: 5-tap overlay button returns immediately to FreeKiosk
  - **Delayed Return**: 5-tap overlay button with confirmation delay before returning


### Fixed
- 🐛 **Status Bar Position in External App Mode**: Status bar now properly sticks to the top of the screen
- 🐛 **Clock Visibility**: Fixed issue with time display not showing correctly


***


## [1.1.3] - 2025-12-21


### Added
- ⌨️ **Keyboard Mode**: New option to control keyboard behavior
  - Default: Use system default keyboard
  - Force Numeric: Always show numeric keyboard
  - Smart Detection: Automatically detect input type and show appropriate keyboard
- 📊 **Status Bar Options for External App Mode**: New sub-options for status bar placement
  - "On External App (Overlay)" - Show custom status bar overlay on top of the external app
  - "On Return Screen" - Show status bar on the "External App Running" screen


### Fixed
- 🐛 **Status Bar System**: Debug and stability improvements for status bar display
- 🐛 **PIN Code Max Failed Attempts**: Fixed issue with max failed attempts counter


***


## [1.1.2] - 2025-12-19


### Added
- 📊 **Status Bar Display**: New option to show/hide Android status bar (battery, WiFi, Bluetooth, sound)
  - Configurable from settings screen
  - Shows system status icons: battery level, WiFi connection, Bluetooth, volume, etc.
  - Useful for monitoring device status without exiting kiosk mode
- 🧪 **Test Mode for External App**: Safety feature for External App Mode
  - Enabled by default for security
  - Allows returning to FreeKiosk using Android back button
  - Prevents accidental lockout during testing
  - Can be disabled for production deployments


***


## [1.1.1] - 2025-12-16


### Added
- 👁️ **Overlay Button Visibility Toggle**: New option to show/hide the return button in External App Mode
  - Button is invisible by default for maximum discretion
  - Real-time opacity update when toggling visibility
  - Button position configurable in settings (default: bottom-right)
- 🗑️ **Device Owner Removal**: New button in Settings to remove Device Owner privileges
  - Helps with uninstallation on Android 15+
  - Automatically resets all settings after removal
- 🔢 **Configurable PIN Attempts**: Set maximum PIN attempts between 1-100 (default: 5)
- 🔐 **Hidden Default PIN Text**: "Default code: 1234" text now hidden when PIN is configured

### Fixed
- 🐛 **Critical: PIN Lockout Expiration**: PIN attempts now automatically reset after 1 hour of inactivity
- 🐛 **Critical: PIN Attempts Persistence**: Expired PIN attempts are now properly saved to storage



## [1.1.0] - 2025-12-11


### Added
- 📱 **External App Mode (Beta)**: Launch and lock any Android app instead of a WebView
  - Select any installed app from a picker
  - Floating overlay button with 5-tap return mechanism
  - Auto-relaunch when user presses Home/Back buttons
  - Full Device Owner lock task support for external apps
- 🔒 **Enhanced Lock Task**: Whitelisted external apps in lock task mode
- 🎯 **Auto-relaunch**: Configurable automatic app restart on exit attempts


### Changed
- 🏗️ Refactored kiosk architecture to support both WebView and External App modes
- ⚡ Improved overlay service reliability and lifecycle management


### Fixed
- 🐛 Potential fix for infinite loading on login pages (cookie/session handling)


***


## [1.0.5] - 2025-11-26


### Added
- 🎥 Motion detection (Beta): Camera-based motion detection to exit screensaver mode
- 🍪 Cookie management: Basic cookie handling via react-native-cookies for web session persistence


### Changed
- 🚀 WebView optimization: Performance improvements specifically for Fire OS tablets
- 🔒 Enhanced WebView security: Additional security measures for safe web content display


### Fixed
- 🐛 WebView stability improvements on Fire OS devices


***


## [1.0.4] - 2025-11-19


### Added
- 🔆 Brightness control: Adjustable screen brightness slider in settings
- 🌙 Screensaver mode: Configurable inactivity timer that dims screen to save power
- 🎥 Camera permission: Added CAMERA permission for web apps requiring camera access
- 🎤 Microphone permission: Added RECORD_AUDIO permission for web apps with audio features
- 📍 Location permissions: Added ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION for location-based web apps
- 📁 Storage permissions: Added READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE for file access support


***


## [1.0.3] - 2025-11-17


### Added
- 🚀 Auto-launch toggle: Enable/disable automatic app launch at device boot
- 💡 Screen always-on feature: Keep screen awake while app is running


### Changed
- 🔧 Improved Device Owner auto-launch handling with preference-based control
- 📱 Enhanced boot receiver logic to respect user auto-launch preference


***


## [1.0.2] - 2025-11-13


### Added
- ⚙️ Configuration access button on main screen for improved first-time user experience
- 🔒 HTTPS self-signed certificate security prompt (accept/reject before proceeding)
- 🗑️ Clear trusted certificates option in Reset All Settings


### Changed
- 📱 Improved Play Store compliance for SSL certificate handling


### Fixed
- 🔐 Self-signed certificates now require explicit user confirmation (browser-like behavior)


***


## [1.0.1] - 2025-10-30


### Added
- 🎉 Initial public release of FreeKiosk
- ✅ Full kiosk mode with Device Owner support
- ✅ Optional screen pinning toggle (ON/OFF in settings)
- ✅ WebView display for any URL
- ✅ HTTPS self-signed certificate support
- ✅ Password protection (4+ characters, alphanumeric support)
- ✅ Reset settings button (clear all config from app)
- ✅ Settings screen with URL and PIN configuration
- ✅ Auto-start on device boot
- ✅ Samsung popup blocking (Device Owner mode)
- ✅ Exit kiosk mode button
- ✅ Immersive fullscreen mode
- ✅ Lock task mode support
- ✅ System apps suspension (Device Owner mode)
- ✅ React Native 0.75 with TypeScript
- ✅ Kotlin native modules
- ✅ Compatible Android 8.0+ (API 26+)
- ✅ English language UI (default)


### Documentation
- 📝 Complete README with installation guide
- 📝 Device Owner setup instructions
- 📝 FAQ document
- 📝 MIT License


***


## [Unreleased]


### Planned for v1.2.0
- Multi-language support (French, Spanish, German)
- Multiple URL rotation
- Scheduled URL changes
- Motion detection via camera
- Auto-brightness scheduling


### Planned for v2.0.0
- FreeKiosk Cloud (MDM Dashboard)
- Remote device configuration
- Multi-device management
- Analytics and monitoring


***


[1.1.3]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.3
[1.1.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.2
[1.1.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.1
[1.1.0]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.1.0
[1.0.5]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.5
[1.0.4]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.4
[1.0.3]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.3
[1.0.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.2
[1.0.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.1
[Unreleased]: https://github.com/rushb-fr/freekiosk/compare/v1.1.3...HEAD
