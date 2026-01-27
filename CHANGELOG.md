# Changelog


All notable changes to FreeKiosk will be documented in this file.


The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

***


## [Unreleased]


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
- ✅ PIN code protection (4-6 digits configurable)
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
