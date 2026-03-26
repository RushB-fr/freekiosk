<div align="center">

# 🧪 Development

_Build, run, and ship FreeKiosk locally._

<p>
  <a href="README.md">Docs Home</a> •
  <a href="installation.md">Installation</a> •
  <a href="roadmap-and-changelog.md">Roadmap</a>
</p>

</div>

> [!NOTE]
> This page focuses on contributor setup. Operational deployment is documented in `installation.md`.

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
- [FAQ](faq.md)

## Related Technical Docs

- [Install Guide](installation.md)
- [ADB Configuration](adb-configuration.md)
- [REST API](rest-api.md)
- [MQTT](MQTT.md)
