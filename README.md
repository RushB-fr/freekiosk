<div align="center">
  <h1>FreeKiosk</h1>
  <p><strong>Free open-source kiosk mode for Android tablets</strong></p>
  <p>Alternative to Fully Kiosk Browser</p>
  
  <p>
    <a href="https://freekiosk.app">Website</a> •
    <a href="#installation">Installation</a> •
    <a href="docs/FAQ.md">FAQ</a> •
    <a href="#features">Features</a>
  </p>
  
  <p>
    <img src="https://img.shields.io/badge/Version-1.2.3-blue.svg" alt="Version 1.2.3">
    <a href="https://github.com/rushb-fr/freekiosk/releases"><img src="https://img.shields.io/github/downloads/rushb-fr/freekiosk/total.svg" alt="Downloads"></a>
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Android-8.0%2B-green.svg" alt="Android 8.0+">
    <img src="https://img.shields.io/badge/Device%20Owner-Supported-brightgreen" alt="Device Owner">
    <img src="https://img.shields.io/badge/REST%20API-40%2B%20Endpoints-orange" alt="REST API">
  </p>
  
  <p><strong>A <a href="https://rushb.fr">Rushb</a> Project</strong></p>
</div>

---

## 🚀 What is FreeKiosk?

FreeKiosk is a **completely free and open-source** kiosk mode application for Android tablets. It's the perfect alternative to expensive commercial solutions.

**Built by [Rushb](https://rushb.fr)**, a French tech company passionate about creating innovative open-source solutions.

### Why FreeKiosk?

- ✅ **100% Free** - No hidden fees, no subscriptions
- ✅ **Open Source** - MIT Licensed, fully auditable
- ✅ **No Tracking** - Your privacy matters
- ✅ **Device Owner Support** - Complete lockdown mode
- ✅ **Optional Screen Pinning** - User choice: full lock or normal mode
- ✅ **HTTPS Support** - Works with self-signed certificates
- ✅ **Easy Setup** - One-time ADB command
- ✅ **Home Assistant Ready** - Perfect for dashboards

---

## ✨ Features

### Core Features
- **Full Kiosk Browser Mode** with Android Device Owner API
- **External App Mode (Beta)** - Lock any Android app instead of a WebView
- **Optional Screen Pinning** - Choose between full lock or normal mode
- **WebView Display** for any URL (dashboards, websites, etc.)
- **HTTPS Support** - Including self-signed certificates
- **Password Protection** - Default: Numeric PIN (4-6 digits). Optional: Advanced mode with alphanumeric passwords (letters, numbers, special characters)
- **Immersive Fullscreen** - No navigation/status bars
- **Reset Settings** - Clear configuration from within the app
- **Exit Kiosk Mode** with restrictions deactivation

### REST API (Home Assistant Ready) 🆕
- **40+ Endpoints** - Full device control via HTTP
- **Sensors**: Battery, brightness, light, proximity, storage, memory, WiFi
- **Controls**: Screen on/off, brightness, volume, navigation, reload
- **Audio**: Play sounds, TTS, beep notifications
- **Screenshot**: Capture screen as PNG image
- **Remote Control**: Android TV navigation (D-pad, back, home, etc.)
- **Optional API Key** authentication
- **[Full API Documentation](docs/REST_API.md)**

### ADB / CLI Configuration 🆕
- **Headless Provisioning** - Configure via ADB without touching the screen
- **Mass Deployment** - Script deployment across multiple devices
- **Full Config Support** - URL, app lock, REST API, screensaver, etc.
- **Secure** - PIN required (first setup or modification)
- **[Full ADB Configuration Guide](docs/ADB_CONFIG.md)**

### Device Owner Mode (Advanced)
- **Complete Device Lockdown**
- **Auto-start on Boot** - Launch automatically
- **System App Suspension** (Samsung bloatware, etc.)
- **Notification Blocking**
- **Home Button Disabled**
- **Recent Apps Disabled**
- **Settings Access Blocked**
- **Status Bar Hidden**

### External App Mode (Beta)
- **Launch Any App** - Select from installed apps picker
- **5-Tap Anywhere** - Tap 5 times rapidly anywhere on screen to access settings (no corner targeting needed)
- **Optional Visual Indicator** - Show bottom-right indicator (5-tap works everywhere regardless)
- **Auto-Relaunch** - Automatically restart app on Home/Back press
- **Lock Task Support** - Full kiosk lockdown for external apps
- **PIN Protection** - Require PIN to access settings
- **Test Mode** - Safety back button (enabled by default)
- **Blocking Overlay** - Touch Logger with countdown and coordinate display

### Flexibility
- **Toggle Screen Pinning ON/OFF** - User decides the security level
- **Default OFF** - Non-intrusive by default
- **In-app Reset** - Clear settings without ADB access

---

## 📱 Perfect For

- 🏠 **Home Assistant Dashboards**
- 🏨 **Hotel Information Displays**
- 🍽️ **Restaurant Digital Menus**
- 🏪 **Retail Point of Sale**
- 🎨 **Museum Exhibits**
- 📊 **Digital Signage**
- 🎮 **Event Check-in Stations**
- 🏥 **Healthcare Kiosks**
- 🚆 **Transportation Info Boards**

---

## 📥 Installation

### Quick Install (Basic Mode)

1. **Download** the latest APK from [Releases](https://github.com/rushb-fr/freekiosk/releases)
2. **Install** on your Android tablet (8.0+)
3. **Configure** your URL and PIN in settings
4. **Optional**: Enable "Pin App to Screen" for full lockdown
5. **Start** kiosk mode

⚠️ Basic mode allows some system interactions (swipe to exit).

---

### Advanced Install (Device Owner Mode) - **Recommended**

For **complete lockdown** with full security, follow these steps:

#### Requirements
- Android 8.0+ tablet
- Windows/Mac/Linux PC
- USB cable
- ADB installed ([Download](https://developer.android.com/studio/releases/platform-tools))

#### Steps

**1. Factory Reset your tablet**
- Settings → System → Reset → Factory reset
- ⚠️ **IMPORTANT**: DO NOT add Google account after reset

**2. Enable USB Debugging**
- Settings → About tablet → Tap "Build number" 7 times
- Settings → Developer options → Enable "USB debugging"

**3. Install FreeKiosk**
- Transfer APK to tablet or download from [Releases](https://github.com/rushb-fr/freekiosk/releases)
- Install the APK

**4. Activate Device Owner (on PC)**

Connect tablet to PC via USB, then run:

adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver

text

You should see:
Success: Device owner set to package com.freekiosk

text

**5. Configure FreeKiosk**

**Option A: Via UI**
- Launch FreeKiosk
- Tap 5 times anywhere on the screen (optional visual indicator available)
- Enter default PIN: **1234**
- Configure your URL
- **Optional**: Enable "Pin App to Screen" for full lockdown
- Save settings

**Option B: Via ADB (Headless Provisioning)** 🆕
```bash
# Configure and lock to external app
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "com.example.myapp" \
    --es pin "1234"

# Or configure WebView URL
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://your-dashboard.com" \
    --es pin "1234"
```
📖 **[Full ADB Configuration Guide](docs/ADB_CONFIG.md)**

Done! Your tablet is now in kiosk mode.

📖 **[Full installation guide](docs/INSTALL.md)**

---

## ⚙️ Configuration

### First Launch
1. Tap **5 times** anywhere on the screen (optional visual indicator available)
2. Enter PIN (default: **1234**)
3. Access Settings screen

### Settings Options
- **🌐 URL to Display** - Your dashboard/website URL
- **🔐 PIN Code** - 4-6 digit security code (change from default!)
- **📌 Pin App to Screen** - Toggle ON for full lockdown, OFF for normal mode
- **🔄 Automatic Reload** - Auto-reload page on error
- **📊 Show Status Bar** - Display battery, WiFi, Bluetooth, and system icons
- **🧪 Test Mode** - Enable back button in External App Mode (default: ON)
- **🔄 Reset All Settings** - Clear configuration (useful in Device Owner mode)
- **🚪 Exit Kiosk Mode** - Close app and disable restrictions

### Screen Pinning Modes

#### OFF (Default)
- User can swipe up to exit
- Normal Android navigation
- Good for: trusted environments, testing

#### ON (Full Lockdown - requires Device Owner)
- All gestures blocked
- Recent apps disabled
- Status bar hidden
- Only 5-tap anywhere on screen + PIN allows exit
- Good for: public kiosks, unattended devices

---

## 🆚 vs Fully Kiosk Browser

| Feature | FreeKiosk | Fully Kiosk |
|---------|-----------|-------------|
| **Price** | 🟢 Free | 🔴 €7.90/device |
| **Open-source** | 🟢 MIT | 🔴 Closed |
| **Device Owner** | ✅ | ✅ |
| **REST API** | ✅ 40+ endpoints | ✅ |
| **Home Assistant** | ✅ | ✅ |
| **Sensors (light, proximity)** | ✅ | ✅ |
| **Screenshot API** | ✅ | ✅ |
| **Audio playback** | ✅ | ✅ |
| **Remote control** | ✅ | ✅ |
| **HTTPS Self-signed** | ✅ | ⚠️ |
| **In-app Reset** | ✅ | ⚠️ |
| **Auto-start** | ✅ | ✅ |
| **Camera photo API** | Roadmap | ✅ |
| **Cloud MDM** | Roadmap | ✅ |

---

## 🛠️ Tech Stack

- **React Native** 0.75+ with TypeScript
- **Kotlin** native modules for Device Owner API
- **Android SDK** 26+ (Android 8.0+)
- **WebView** with custom SSL handling

---

## 🗺️ Roadmap

### ✅ v1.2.3 (Jan 2026) - Auto Brightness & Security Improvements 🆕
- 📷 **Motion Detection Camera Selection**: Choose which camera to use for motion detection (front/back)
- 🔘 **Flexible PIN Access Button**: Choose between fixed corner button or tap-anywhere mode for accessing settings
- ⬅️ **WebView Back Button**: Optional back navigation button in WebView for easier browsing
- ☀️ **Auto Brightness**: Automatic brightness adjustment based on ambient light sensor
- 🔐 **Enhanced PIN System**: Improved PIN mode with advanced password option
- 🔒 **REST API Key Security**: API key now stored in Android Keychain (encrypted) with automatic migration
- 🔧 **Bug Fixes**: Fixed blocking overlay display issues and auto-update reliability

### ✅ v1.2.2 (Jan 2026) - Volume 5-Tap & Screen Control Fixes
- 🔊 **Volume 5-Tap Gesture**: Alternative to shake for accessing PIN screen
  - Press Volume Up/Down 5 times quickly to access settings
  - Works when volume is at max or min
  - Only active when kiosk mode is enabled
- 🖥️ **Screen On/Off API Fix**: Improved reliability for Device Owner and non-Device Owner modes
- 🔧 **React Native New Architecture**: Fixed compatibility with BroadcastReceivers

### ✅ v1.2.1 (Jan 2026) - ADB Configuration & Headless Provisioning
- 🔌 **ADB Configuration Support**: Configure FreeKiosk via command line for automated deployment
- 📦 **Headless Provisioning**: Set locked app, URL, and all settings without UI interaction
- 🚀 **Auto-restart & Launch**: Automatically restart and launch external app after configuration
- 📝 **JSON & Parameter Support**: Full JSON config or individual parameters via ADB
- 🛠️ **Mass Deployment Ready**: Perfect for CI/CD and enterprise provisioning
- 💾 **Backup & Restore**: Export/import complete FreeKiosk configuration to/from JSON file
- 🔌 **Allow Power Button**: New security setting to allow power menu access in Lock Mode
- 🔧 **REST API Fixes**: Improved server stability and error handling
- 📖 **[ADB Configuration Guide](docs/ADB_CONFIG.md)** with examples and scripts

### ✅ v1.2.0 (Jan 2026) - UI Redesign, URL Management & REST API
- 🎨 **Complete Settings UI Redesign**: Modern Material Design with 4 organized tabs (General, Display, Security, Advanced)
- 🔄 **URL Rotation**: Automatically cycle through multiple URLs at configurable intervals
- 📅 **URL Planner**: Schedule URLs based on time/date with recurring and one-time events
- 🌐 **REST API Server**: Built-in HTTP server for Home Assistant integration
- 📡 **40+ Endpoints**: Complete device control via HTTP
- 📊 **Sensor Endpoints**: Battery, brightness, light, proximity, storage, memory, WiFi
- 🎮 **Control Endpoints**: Screen on/off, brightness, volume, navigation, reload
- 🔊 **Audio Endpoints**: Play URL, stop, beep sound
- 📸 **Screenshot Endpoint**: Capture screen as PNG
- 📺 **Remote Control**: Android TV navigation (D-pad, back, home, menu, play/pause)
- 🔐 **API Key Authentication**: Optional security
- 📝 **[Full API Documentation](docs/REST_API.md)**

### ✅ v1.1.4 (Dec 2025)
- 🔄 **In-App Direct Update**: Update FreeKiosk directly from within the app (Device Owner mode)
- 🎨 **Status Bar Item Selection**: Show/hide individual items (Home, Time, Battery, WiFi, Bluetooth, Sound)
- 🧪 **Test Mode Options**: Three test modes for External App (Test Mode, Immediate Return, Delayed Return)
- 🐛 **Status Bar Position**: Fixed status bar now properly sticks to the top in External App mode
- 🐛 **Clock Visibility**: Fixed time display issue

### ✅ v1.1.3 (Dec 2025)
- ⌨️ **Keyboard Mode**: Default, Force Numeric, or Smart Detection
- 📊 **Status Bar in External Mode**: Choose to display on external app overlay and/or return screen
- 🐛 **Status Bar System**: Debug and stability fixes
- 🐛 **PIN Code Max Attempts**: Fixed counter issue

### ✅ v1.1.2 (Dec 2025)
- 📊 **Status Bar Display**: New option to show/hide Android status bar (battery, WiFi, Bluetooth, sound)
- 🧪 **Test Mode for External App**: Safety feature with back button (enabled by default)

### ✅ v1.1.1 (Dec 2025)
- 👁️ **Overlay Button Visibility Toggle**: Show/hide return button in External App Mode
- 🗑️ **Device Owner Removal**: Easy removal of Device Owner privileges for uninstallation
- 🔢 **Configurable PIN Attempts**: Set maximum attempts (1-100) with 15min lockout
- 🐛 **Critical Fix**: PIN attempts now auto-reset after 1 hour of inactivity
- 🐛 **Critical Fix**: Expired PIN attempts properly persisted to storage

### ✅ v1.1.0 (Dec 2025)
- 📱 **External App Mode (Beta)**: Launch and lock any Android app instead of a WebView
- 🔒 Enhanced Lock Task: Whitelisted external apps in lock task mode
- 🎯 Auto-relaunch: Configurable automatic app restart on exit attempts
- 🐛 Potential fix for infinite loading on login pages (cookie/session handling)
- 🐛 Lock task mode stability improvements

### ✅ v1.0.5 (Nov 2025)
- 🎥 Motion detection (Beta): Camera-based motion detection to exit screensaver mode
- 🍪 Cookie management: Basic cookie handling via react-native-cookies for web session persistence
- 🚀 WebView optimization: Performance improvements specifically for Fire OS tablets
- 🔒 Enhanced WebView security: Additional security measures for safe web content display
- 🐛 WebView stability improvements on Fire OS devices

### ✅ v1.0.4 (Nov 2025)
- 🔆 Brightness control: Adjustable screen brightness slider in settings
- 🌙 Screensaver mode: Configurable inactivity timer that dims screen to save power
- 🎥 Added CAMERA permission for web apps needing camera access
- 🎤 Added RECORD_AUDIO permission for web apps with audio features
- 📍 Added ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION permissions for location-based web apps
- 📁 Added READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE permissions for file access support

### ✅ v1.0.3 (Nov 2025)
- ✅ Auto-launch toggle: Enable/disable automatic app launch at device boot
- ✅ Screen always-on feature: Keep screen awake while app is running
- ✅ Improved Device Owner auto-launch handling

### ✅ v1.0.2 (Nov 2025)
- ✅ Configuration access button on main screen
- ✅ HTTPS self-signed certificate security prompt
- ✅ Clear trusted certificates in reset settings
- ✅ Improved Play Store compliance for SSL

### ✅ v1.0.1 (Oct 2025)
- ✅ Initial public release
- ✅ Full kiosk mode with Device Owner support
- ✅ Optional screen pinning toggle (ON/OFF in settings)
- ✅ WebView display for any URL
- ✅ HTTPS self-signed certificate support
- ✅ PIN code protection (4-6 digits configurable)
- ✅ Reset settings button
- ✅ Auto-start on device boot
- ✅ Samsung popup blocking (Device Owner mode)
- ✅ Immersive fullscreen mode
- ✅ Lock task mode support
- ✅ System apps suspension (Device Owner mode)
- ✅ English language UI

### v1.3.0 (Q1 2026)
- [ ] 📷 Camera Photo API - Take photos via REST endpoint
- [X] 🔆 Auto-brightness - Adjust brightness based on light sensor
- [ ] 📲 QR Code Config - Scan QR to configure app settings
- [X] 💾 Backup/Restore - Export and import configuration
- [ ] 🎤 Acoustic Wake - Voice detection to wake from screensaver
- [ ] 🔔 Webhook Events - Send events (motion, tap, battery) to URL
- [ ] 🎬 Media Player - Play videos, images, playlists (digital signage)

### v2.0.0 (Q2 2026) - FreeKiosk Cloud
- [ ] ☁️ **FreeKiosk Cloud** - MDM Dashboard for fleet management
- [ ] 📱 Multi-device management - Control all tablets from one place
- [ ] ⚙️ Remote configuration - Push settings to devices remotely
- [ ] 📊 Analytics & monitoring - Usage stats, health checks, alerts
- [ ] 🔄 OTA Updates - Deploy app updates to all devices
- [ ] 👥 User management - Roles and permissions
- [ ] 🏢 Organization support - Multi-tenant for businesses
- [ ] 📡 Device groups - Organize devices by location/function

### v2.5.0 (Q4 2026) - Integrations
- [ ] 🏠 HACS Integration - Native Home Assistant plugin
- [ ] 🌍 Multi-language - French, Spanish, German, Portuguese
- [ ] 🎨 Custom Themes - Personalize UI colors and branding
- [ ] 📡 MQTT Support - Alternative to REST for real-time events
- [ ] 🔗 Tasker Integration - Android automation support
- [ ] 📺 Chromecast Support - Cast content to displays

---

## 🔧 Development

### Prerequisites
- Node.js 18+
- React Native CLI
- Android Studio
- JDK 17+

### Setup

Clone repository
git clone https://github.com/rushb-fr/freekiosk.git
cd freekiosk

Install dependencies
npm install

Android setup
cd android
gradlew clean

Run on device
npx react-native run-android

text

### Build Release APK

cd android
gradlew assembleRelease

APK location:
android/app/build/outputs/apk/release/app-release.apk
text

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Ways to Contribute
- 🐛 Report bugs via [Issues](https://github.com/rushb-fr/freekiosk/issues)
- 💡 Suggest features
- 🔧 Submit pull requests
- 📖 Improve documentation
- 🌍 Translate to other languages
- ⭐ Star the project!

### Contributors
<a href="https://github.com/rushb-fr/freekiosk/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=rushb-fr/freekiosk" />
</a>

---

## 🐛 Known Issues

- Factory reset required to remove Device Owner (Android limitation)
- Some Samsung devices may require additional ADB permissions

See [Issues](https://github.com/rushb-fr/freekiosk/issues) for full list.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Rushb

---

## 🏢 About Rushb

FreeKiosk is developed and maintained by **[Rushb](https://rushb.fr)**, a French tech company specialized in innovative software solutions.

**Other Rushb Projects:**
- More coming soon! 🚀

**Contact:**
- Website: [rushb.fr](https://rushb.fr)
- Email: [contact@rushb.fr](mailto:contact@rushb.fr)
- GitHub: [@rushb-fr](https://github.com/rushb-fr)

---

## 🙏 Acknowledgments

- Built with [React Native](https://reactnative.dev/)
- Thanks to the open-source community

---

## 📊 Stats

<div align="center">
  <img src="https://img.shields.io/github/stars/rushb-fr/freekiosk?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/rushb-fr/freekiosk?style=social" alt="Forks">
  <img src="https://img.shields.io/github/issues/rushb-fr/freekiosk" alt="Issues">
  <img src="https://img.shields.io/github/license/rushb-fr/freekiosk" alt="License">
</div>

---

<div align="center">
  <p><strong>Made with ❤️ in France by Rushb</strong></p>
  <p>
    <a href="https://freekiosk.app">Website</a> •
    <a href="https://github.com/rushb-fr/freekiosk">GitHub</a> •
    <a href="mailto:contact@rushb.fr">Contact</a> •
    <a href="https://github.com/rushb-fr/freekiosk/releases">Download</a>
  </p>
</div>