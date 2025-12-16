# Changelog


All notable changes to FreeKiosk will be documented in this file.


The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


***


## [1.1.1] - 2025-12-16


### Added
- 👁️ **Overlay Button Visibility Toggle**: New option to show/hide the return button in External App Mode
  - Button is invisible by default for maximum discretion
  - Real-time opacity update when toggling visibility
  - Visible button appears as a small blue button in bottom-right corner
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


[1.0.5]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.5
[1.0.4]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.4
[1.0.3]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.3
[1.0.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.2
[1.0.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.1
[Unreleased]: https://github.com/rushb-fr/freekiosk/compare/v1.0.5...HEAD
