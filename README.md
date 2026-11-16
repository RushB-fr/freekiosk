<div align="center">
  <h1>FreeKiosk</h1>
  <p><strong>Free open-source kiosk mode for Android tablets</strong></p>
  <p>Alternative to Fully Kiosk Browser (<a href="https://freekiosk.app/vs-fully-kiosk/">see how they compare</a>)</p>
  
  <p>
    <a href="https://freekiosk.app">Website</a> •
    <a href="#-install-in-60-seconds">Installation</a> •
    <a href="docs/faq.md">FAQ</a> •
    <a href="#-key-capabilities">Features</a>
  </p>
  
  <p>
    <img src="https://img.shields.io/badge/Version-2.0.0-blue.svg" alt="Version 2.0.0">
    <a href="https://github.com/rushb-fr/freekiosk/releases"><img src="https://img.shields.io/github/downloads/rushb-fr/freekiosk/total.svg" alt="Downloads"></a>
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Android-8.0%2B-green.svg" alt="Android 8.0+">
    <img src="https://img.shields.io/badge/Device%20Owner-Supported-brightgreen" alt="Device Owner">
    <img src="https://img.shields.io/badge/REST%20API-40%2B%20Endpoints-orange" alt="REST API">
    <img src="https://img.shields.io/badge/MQTT-Home%20Assistant%20Discovery-41BDF5" alt="MQTT">
  </p>
  
  <p><strong>A <a href="https://rushb.fr">Rushb</a> Project</strong></p>
</div>

FreeKiosk is an open-source kiosk platform for Android tablets, built for teams that want **full control without license costs**.

<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.freekiosk"><img src="https://img.shields.io/badge/Google%20Play-Get%20it-34A853?logo=googleplay&logoColor=white" alt="Get it on Google Play"></a>
  <a href="https://github.com/rushb-fr/freekiosk/releases/latest"><img src="https://img.shields.io/badge/APK-GitHub%20Releases-181717?logo=github&logoColor=white" alt="Download the APK from GitHub Releases"></a>
</p>

<p align="center">
  <img src="docs/screenshots/any-web-page-full-screen.png" alt="FreeKiosk showing a web page full screen on a tablet (demo page)" width="49%">
  <img src="docs/screenshots/lock-it-down.png" alt="FreeKiosk Security settings with Lock Mode on (demo)" width="49%">
</p>

Instead of burying everything in one long page, this README gives you the essentials and points to complete docs in `docs/`.

### Why teams choose it

- ✅ Free and MIT licensed
- ✅ Device Owner support for true lockdown
- ✅ Works in WebView mode or External App mode
- ✅ Native REST API and MQTT integration
- ✅ Headless ADB provisioning for mass rollout
- ✅ Privacy-first: no mandatory tracking layer
- ✅ Available in English, French and Brazilian Portuguese

## ✨ Key capabilities

| Area | What you get | Deep dive |
|---|---|---|
| Kiosk modes | Website (WebView), External App, Dashboard of pages, Media Player (videos and images) | [Features and Modes](docs/features-and-modes.md) |
| Device control | Lock task, boot behavior, status bar policies, PIN access | [Installation](docs/installation.md) |
| Automation | 40+ REST endpoints, MQTT discovery for Home Assistant, ioBroker adapter | [Integrations](docs/INTEGRATIONS.md) |
| Provisioning | ADB command-based configuration and scripting | [ADB Configuration](docs/adb-configuration.md) |
| Fleet management | Optional FreeKiosk Cloud (open beta): remote config, commands, groups, alerts, QR enrollment | See [FreeKiosk Cloud](#-freekiosk-cloud-open-beta) below |
| Digital signage (beta) | Playlists of videos, images, web pages and YouTube videos built in the cloud, with schedules and offline playback; Android TV, Google TV and Fire TV | [Digital signage](docs/digital-signage.md), [Android TV](docs/android-tv.md) |

## 📦 Install in 60 seconds

1. Install FreeKiosk from [Google Play](https://play.google.com/store/apps/details?id=com.freekiosk), or download the latest APK from [Releases](https://github.com/rushb-fr/freekiosk/releases).
2. Install on Android 8.0+ tablet.
3. Configure URL/app + PIN.
4. Start kiosk mode.

For production lockdown, use Device Owner mode:

```bash
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver
```

👉 Full setup guide: [docs/installation.md](docs/installation.md)

## 🧩 Docs map

| I want to... | Go to |
|---|---|
| Deploy tablets correctly | [Installation Guide](docs/installation.md) |
| Understand display/kiosk modes | [Features and Modes](docs/features-and-modes.md) |
| Integrate with Home Assistant | [Integrations Overview](docs/INTEGRATIONS.md) |
| Integrate with ioBroker | [ioBroker](docs/INTEGRATIONS.md#iobroker) |
| Manage a fleet from a dashboard | [FreeKiosk Cloud](docs/cloud.md) |
| Use API endpoints | [REST API Docs](docs/rest-api.md) |
| Configure MQTT topics/discovery | [MQTT Docs](docs/MQTT.md) |
| Provision with scripts | [ADB Configuration](docs/adb-configuration.md) |
| Follow release direction | [Roadmap and Changelog](docs/roadmap-and-changelog.md) |
| Contribute code | [Development Guide](docs/development.md) |

## ☁️ FreeKiosk Cloud (open beta)

**FreeKiosk Cloud** is a companion service that manages a fleet from a web dashboard: live status, configuration pushed to devices or groups, remote commands and screenshots. A tablet can be enrolled by scanning a QR code, and a factory-reset tablet can be provisioned end to end from the Android setup wizard.

**The cloud is in open beta, with self-service sign-up** at [cloud.freekiosk.app](https://cloud.freekiosk.app): the first device is free, then it is priced per device (see [freekiosk.app/cloud](https://freekiosk.app/cloud) and the [cloud guide](docs/cloud.md)). The free device has the whole service except APK distribution, remote screenshots, the scheduler, renaming the organization and additional team members, which come with the first paid licence. The app itself, `v2.0.0`, is stable. Some cloud paths (over-the-air app updates, QR provisioning, Lock Mode behaviour on every model) have not been proven across enough real hardware for us to call the cloud finished.

**Digital signage is in beta** on both sides: build a playlist of videos, images, web pages and YouTube videos in the dashboard and a screen plays it, with schedules and from an offline cache (web pages and YouTube need the network). It needs the app `v2.1.0-beta.1`, a [GitHub pre-release](https://github.com/RushB-fr/freekiosk/releases) (Google Play still has `2.0.0`), and also runs on Android TV, Google TV and Fire TV, **tested on emulators only so far**. Details and limits: [Digital signage](docs/digital-signage.md).

**The app itself is unaffected.** FreeKiosk stays free and MIT licensed, and the cloud is entirely opt-in: nothing leaves the device until you enroll it. Every kiosk feature, the REST API and the MQTT integration work exactly as before without a cloud account, and always will.

> [!NOTE]
> **The management server will be released as open source in 2027, so you can self-host it.**
> That is the intended end state, not an afterthought: a kiosk platform you cannot host yourself is only half free. We are holding it back until it is stable and feature-complete rather than publishing something that would be painful to run.

## 🛠️ Tech stack

- React Native + TypeScript
- Kotlin native modules (Android policy and system control)
- Android SDK 26+ (Android 8+)

## 🗺️ Roadmap snapshot

- `v1.2.x`: reliability and operational hardening (shipped)
- `v2.0.0`: stable app, with optional cloud enrollment (shipped)
- FreeKiosk Cloud: open beta, until the OTA update path, QR provisioning and Lock Mode behaviour are proven on real fleets
- 2027: the management server released as open source for self-hosting

Detailed notes: [docs/roadmap-and-changelog.md](docs/roadmap-and-changelog.md)

## 🤝 Contributing

Contributions are welcome.

- Guidelines: [CONTRIBUTING.md](CONTRIBUTING.md)
- Issues: [GitHub Issues](https://github.com/rushb-fr/freekiosk/issues)
- Discussions: [GitHub Discussions](https://github.com/rushb-fr/freekiosk/discussions)

---

## 📄 License

MIT License. See [LICENSE](LICENSE).

<div align="center">
  <img src="https://img.shields.io/github/stars/rushb-fr/freekiosk?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/rushb-fr/freekiosk?style=social" alt="Forks">
  <img src="https://img.shields.io/github/issues/rushb-fr/freekiosk" alt="Issues">
  <img src="https://img.shields.io/github/license/rushb-fr/freekiosk" alt="License">
</div>

<div align="center">
  <p><strong>Made with ❤️ in France by Rushb</strong></p>
  <p>
    <a href="https://freekiosk.app">Website</a> •
    <a href="https://github.com/rushb-fr/freekiosk">GitHub</a> •
    <a href="mailto:support@freekiosk.app">Contact</a>
  </p>
</div>