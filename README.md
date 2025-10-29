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
    <img src="https://img.shields.io/badge/Version-1.0.1-blue.svg" alt="Version 1.0.1">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Android-8.0%2B-green.svg" alt="Android 8.0+">
    <img src="https://img.shields.io/badge/Device%20Owner-Supported-brightgreen" alt="Device Owner">
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
- **Optional Screen Pinning** - Choose between full lock or normal mode
- **WebView Display** for any URL (dashboards, websites, etc.)
- **HTTPS Support** - Including self-signed certificates
- **PIN Code Protection** (4-6 digits)
- **Immersive Fullscreen** - No navigation/status bars
- **Reset Settings** - Clear configuration from within the app
- **Exit Kiosk Mode** with restrictions deactivation

### Device Owner Mode (Advanced)
- **Complete Device Lockdown**
- **Auto-start on Boot** - Launch automatically
- **System App Suspension** (Samsung bloatware, etc.)
- **Notification Blocking**
- **Home Button Disabled**
- **Recent Apps Disabled**
- **Settings Access Blocked**
- **Status Bar Hidden**

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
- Launch FreeKiosk
- Tap 5 times in bottom-right corner
- Enter default PIN: **1234**
- Configure your URL
- **Optional**: Enable "Pin App to Screen" for full lockdown
- Save settings

Done! Your tablet is now in kiosk mode.

📖 **[Full installation guide](docs/INSTALL.md)**

---

## ⚙️ Configuration

### First Launch
1. Tap **5 times** in the bottom-right corner
2. Enter PIN (default: **1234**)
3. Access Settings screen

### Settings Options
- **🌐 URL to Display** - Your dashboard/website URL
- **🔐 PIN Code** - 4-6 digit security code (change from default!)
- **📌 Pin App to Screen** - Toggle ON for full lockdown, OFF for normal mode
- **🔄 Automatic Reload** - Auto-reload page on error
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
- Only 5-tap + PIN allows exit
- Good for: public kiosks, unattended devices

---

## 🆚 vs Fully Kiosk Browser

| Feature | FreeKiosk | Fully Kiosk |
|---------|-----------|-------------|
| **Price** | 🟢 Free | 🔴 €7.90/device |
| **Open-source** | 🟢 MIT | 🔴 Closed |
| **Device Owner** | ✅ | ✅ |
| **Optional Pinning** | ✅ | ❌ |
| **HTTPS Self-signed** | ✅ | ⚠️ |
| **In-app Reset** | ✅ | ⚠️ |
| **Auto-start** | ✅ | ✅ |
| **Advanced features** | Roadmap | ✅ |
| **Cloud MDM** | Roadmap | ✅ |

---

## 🛠️ Tech Stack

- **React Native** 0.75+ with TypeScript
- **Kotlin** native modules for Device Owner API
- **Android SDK** 26+ (Android 8.0+)
- **WebView** with custom SSL handling

---

## 🗺️ Roadmap

### ✅ v1.0.1 (Current - Oct 2025)
- ✅ Optional screen pinning toggle
- ✅ HTTPS self-signed certificate support
- ✅ Default OFF mode (user choice)
- ✅ In-app reset settings
- ✅ English language UI
- ✅ Improved Device Owner integration

### v1.1.0 (Q4 2025)
- [ ] Multi-language support (FR, DE, ES)
- [ ] Dark mode
- [ ] Multiple URL rotation
- [ ] Scheduled URL changes
- [ ] Motion detection (camera wake-up)
- [ ] Auto-brightness scheduling
- [ ] Offline mode

### v1.2.0 (Q1 2026)
- [ ] Remote configuration (Firebase)
- [ ] Basic analytics (device status)
- [ ] URL favorites list
- [ ] Custom timeout settings
- [ ] Battery monitoring alerts

### v2.0.0 (Q2 2026)
- [ ] **FreeKiosk Cloud** (MDM Dashboard)
- [ ] Multi-device management
- [ ] Remote commands
- [ ] Fleet monitoring
- [ ] Advanced analytics

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