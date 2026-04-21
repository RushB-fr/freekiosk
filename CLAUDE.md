# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is FreeKiosk

FreeKiosk is a free, open-source Android kiosk platform built with React Native + TypeScript, with extensive Kotlin native modules for device control. It is designed as an open alternative to Fully Kiosk Browser.

Key capabilities: WebView kiosk, external app launcher, dashboard, media player, 40+ REST API endpoints, MQTT/Home Assistant integration, Device Owner mode, ADB provisioning.

## Commands

```bash
# Development
npm start                           # Start Metro bundler
npm run android                     # Run on connected device/emulator
npm run lint                        # ESLint
npm test                            # Jest unit tests
npm test -- --testPathPattern=foo   # Run a single test file

# Android build
cd android && ./gradlew assembleRelease   # Release APK
cd android && ./gradlew assembleBundle   # Release AAB (Play Store)
```

Output APK: `android/app/build/outputs/apk/release/app-release.apk`

Requirements: Node 20+, JDK 17+, Android SDK 26+.

## Architecture

### React Native ↔ Native Bridge Pattern

Every piece of device functionality lives in a Kotlin module (`android/app/src/main/java/com/freekiosk/`) paired with a TypeScript bridge in `src/utils/`. When adding device-level features, both sides must be updated together.

Key native modules:
- **KioskModule.kt** — lock task, screen on/off, power, home button override
- **AppLauncherModule.kt** — external app lifecycle management
- **BlockingOverlayModule.kt** — draws overlay views to block UI regions
- **HttpServerModule.kt** — embedded HTTP server for REST API
- **FreeKioskAccessibilityService.kt** — accessibility service for back-button/gesture suppression
- **BackgroundAppMonitorService.kt** / **KioskWatchdogService.kt** — foreground services keeping kiosk alive

### State & Storage

`src/utils/storage.ts` is the central persistent state layer (~2000+ lines). All settings, kiosk config, and feature flags are stored via AsyncStorage abstractions here. `src/utils/secureStorage.ts` handles credentials via Keychain. Virtually every component reads settings through these utilities.

### Display Modes

`src/screens/KioskScreen.tsx` is the primary runtime screen. It conditionally renders one of:
- **WebViewComponent** — wraps `react-native-webview` with auto-reload, keyboard avoidance, cookie injection, HTTP basic auth
- **ExternalAppOverlay** — launches and monitors an external Android app
- **MediaPlayerComponent** — video/image slideshow player
- **DashboardGrid** — tile-based launcher

Mode is determined by settings read from storage at startup.

### Settings UI

`src/screens/settings/SettingsScreenNew.tsx` hosts a tabbed settings interface. Each tab is a separate component under `src/screens/settings/tabs/` and `src/components/settings/`. The settings UI uses React Native Paper (Material Design).

### Navigation

Minimal stack: `src/navigation/AppNavigator.tsx` routes between KioskScreen, PinScreen, SettingsScreenNew, and BlockingOverlaysScreen.

### REST API & MQTT

`src/utils/ApiService.ts` handles inbound REST requests (routed through `HttpServerModule`). `src/utils/MqttModule.ts` manages MQTT for Home Assistant discovery. Documentation for all endpoints is in `docs/rest-api.md` and `docs/MQTT.md`.

### Types

Shared TypeScript types for complex features live in `src/types/` — important ones: `managedApps.ts`, `dashboard.ts`, `blockingOverlay.ts`, `screenScheduler.ts`, `planner.ts`.

### Dependency Patches

`patches/` contains patch-package patches applied via `postinstall`. Do not upgrade patched dependencies without verifying the patches still apply.
