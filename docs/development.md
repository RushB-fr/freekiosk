

# 🧪 FreeKiosk Development Guide

**Build, run, and ship FreeKiosk locally**

<p>
  <a href="README.md">📚 Docs Home</a> •
  <a href="installation.md">🔧 Installation</a> •
  <a href="roadmap-and-changelog.md">🗺️ Roadmap</a>
</p>



> [!NOTE]
> This page focuses on **contributor setup**. Operational deployment is documented in [`installation.md`](Installation).

## 📋 Prerequisites



| ⚙️ Tool | 📏 Version | 📋 Purpose |
|---|---|---|
| **Node.js** | 18+ | JavaScript runtime |
| **React Native CLI** | Latest | Cross-platform development |
| **Android Studio** | Latest | Android emulator & build tools |
| **JDK** | 17+ | Java development for Android |
| **Git** | Latest | Version control |



### 🔧 Additional Requirements

- **Android SDK** (API level 26+ / Android 8.0+)
- **Physical Android device** or **Emulator** for testing
- **USB debugging** enabled on development device

## 🚀 Local Setup



```bash
# Clone the repository
git clone https://github.com/rushb-fr/freekiosk.git
cd freekiosk

# Install dependencies
npm install

# iOS dependencies (if developing for iOS)
cd ios && pod install && cd ..
```



> [!TIP]
> Make sure to run `pod install` after any changes to native dependencies.

## 📱 Run on Android



```bash
# Start Metro bundler
npm start

# In another terminal, run on Android
npx react-native run-android

# Or run on specific device
npx react-native run-android --device <device_id>
```



### 🔍 Common Issues

| ❌ Issue | ✅ Solution |
|---|---|
| **Metro bundler not starting** | Clear cache: `npm start -- --reset-cache` |
| **Build fails** | Clean Android build: `cd android && ./gradlew clean && cd ..` |
| **Device not detected** | Check USB debugging: `adb devices` |

## 📦 Build Release APK



```bash
# Navigate to Android directory
cd android

# Build release APK
./gradlew assembleRelease

# Build release AAB (for Play Store)
./gradlew assembleBundle
```



### 📂 Output Locations



| 📄 Format | 📍 Path |
|---|---|
| **APK** | `android/app/build/outputs/apk/release/app-release.apk` |
| **AAB** | `android/app/build/outputs/bundle/release/app-release.aab` |



> [!IMPORTANT]
> For production builds, make sure to configure your signing keys in `android/app/build.gradle`.

## 🤝 Contributing



| 📋 Resource | 🔗 Link |
|---|---|
| **📖 Contributing Guide** | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| **🐛 Issue Tracker** | [GitHub Issues](https://github.com/rushb-fr/freekiosk/issues) |
| **💬 Discussions** | [GitHub Discussions](https://github.com/rushb-fr/freekiosk/discussions) |
| **❓ FAQ** | [FAQ](FAQ) |



### 🎯 How to Contribute

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

## 🔗 Related Technical Docs



| 📚 Documentation | 🎯 Focus |
|---|---|
| **🔧 Install Guide** | [Installation](Installation) - Manual setup instructions |
| **⌨️ ADB Configuration** | [ADB-Configuration](ADB-Configuration) - Scripted provisioning |
| **🌐 REST API** | [REST-API](REST-API) - HTTP endpoints and automation |
| **📡 MQTT** | [MQTT](MQTT) - Home Assistant integration |
| **🗺️ Roadmap** | [Roadmap-and-Changelog](Roadmap-and-Changelog) - Release planning |



---

## 🏗️ Project Structure



```
freekiosk/
├── src/                    # React Native source code
│   ├── components/         # Reusable UI components
│   ├── screens/           # App screens
│   ├── navigation/        # Navigation configuration
│   └── assets/           # Images and resources
├── android/               # Android-specific code
│   ├── app/              # Main Android app
│   ├── gradle/           # Gradle build configuration
│   └── build.gradle      # Android build script
├── ios/                  # iOS-specific code (if applicable)
├── docs/                 # Documentation source
└── __tests__/           # Unit tests
```



---



**Made with ❤️ by [FreeKiosk Team](https://freekiosk.app)**


