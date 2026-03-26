# Development

## Prerequisites

- Node.js 18+
- React Native toolchain
- Android Studio
- JDK 17+

## Local Setup

```bash
git clone https://github.com/rushb-fr/freekiosk.git
npm install
```

## Run on Android

```bash
npx react-native run-android
```

## Build Release APK

```bash
cd android
./gradlew assembleRelease
```

Output APK:

- `android/app/build/outputs/apk/release/app-release.apk`

## Contributor Links

- [Contributing Guide](../CONTRIBUTING.md)
- [Issue Tracker](https://github.com/rushb-fr/freekiosk/issues)
- [FAQ](FAQ.md)

## Related Technical Docs

- [Install Guide](INSTALL.md)
- [ADB Configuration](ADB_CONFIG.md)
- [REST API](REST_API.md)
- [MQTT](MQTT.md)
