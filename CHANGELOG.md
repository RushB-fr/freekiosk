# Changelog

All notable changes to FreeKiosk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

***

## [1.0.3] - 2025-11-17

### Added
- 🚀 Auto-launch toggle: Enable/disable automatic app launch at device boot
- 💡 Screen always-on feature: Keep screen awake while app is running
- 📲 Open Settings button: Quick access to Android system settings from app

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

[1.0.3]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.3
[1.0.2]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.2
[1.0.1]: https://github.com/rushb-fr/freekiosk/releases/tag/v1.0.1
[Unreleased]: https://github.com/rushb-fr/freekiosk/compare/v1.0.3...HEAD
