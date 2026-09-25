<div align="center">
  <h1>FreeKiosk</h1>
  <p><strong>Free open-source kiosk mode for Android tablets</strong></p>
  <p>Alternative to Fully Kiosk Browser</p>
  
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

Instead of burying everything in one long page, this README gives you the essentials and points to complete docs in `docs/`.

### Why teams choose it

- ✅ Free and MIT licensed
- ✅ Device Owner support for true lockdown
- ✅ Works in WebView mode or External App mode
- ✅ Native REST API and MQTT integration
- ✅ Headless ADB provisioning for mass rollout
- ✅ Privacy-first: no mandatory tracking layer

## ✨ Key capabilities

| Area | What you get | Deep dive |
|---|---|---|
| Kiosk modes | WebView, External App, Dashboard, Media/Multi-App evolution | [Features and Modes](docs/features-and-modes.md) |
| Device control | Lock task, boot behavior, status bar policies, PIN access | [Installation](docs/installation.md) |
| Automation | 40+ REST endpoints, MQTT discovery for Home Assistant | [Integrations](docs/INTEGRATIONS.md) |
| Provisioning | ADB command-based configuration and scripting | [ADB Configuration](docs/adb-configuration.md) |
| Fleet management | Optional cloud enrollment, remote config, commands, OTA updates | See below |

## 📦 Install in 60 seconds

1. Download the latest APK from [Releases](https://github.com/rushb-fr/freekiosk/releases).
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
| Use API endpoints | [REST API Docs](docs/rest-api.md) |
| Configure MQTT topics/discovery | [MQTT Docs](docs/MQTT.md) |
| Provision with scripts | [ADB Configuration](docs/adb-configuration.md) |
| Follow release direction | [Roadmap and Changelog](docs/roadmap-and-changelog.md) |
| Contribute code | [Development Guide](docs/development.md) |

## ☁️ FreeKiosk Cloud (closed beta)

From `v2.0.0-beta.1`, FreeKiosk can enroll into **FreeKiosk Cloud**, a companion server that manages a fleet from a web dashboard: live telemetry, configuration pushed to devices or groups, remote commands, screenshots, and over-the-air app updates. A factory-reset tablet can be provisioned end to end by scanning a QR code at the Android setup wizard.

**It is a closed beta, by invitation only.** The `v2.0.0-beta.x` builds are published as GitHub **pre-releases**: the feature works and is in daily use, but the OTA update path, QR provisioning and Lock Mode behaviour have not yet been proven across enough real hardware for us to call it done. Request an invitation at [support@freekiosk.app](mailto:support@freekiosk.app).

**The app itself is unaffected.** FreeKiosk stays free and MIT licensed, and the cloud is entirely opt-in: nothing leaves the device until you enroll it. Every kiosk feature, the REST API and the MQTT integration work exactly as before without a cloud account, and always will.

> [!NOTE]
> **The management server will be released as open source, so you can self-host it.**
> That is the intended end state, not an afterthought: a kiosk platform you cannot host yourself is only half free. We are holding it back until it is stable and feature-complete rather than publishing something that would be painful to run. **No date is set**, and we would rather say that plainly than announce one we might miss.

## 🥊 FreeKiosk vs Fully Kiosk Browser

| Feature | FreeKiosk | Fully Kiosk |
|---------|-----------|-------------|
| Price | 🟢 Free | 🔴 Paid per device |
| Open-source | 🟢 MIT | 🔴 Closed source |
| Device Owner mode | ✅ | ✅ |
| REST API | ✅ | ✅ |
| MQTT + Home Assistant discovery | ✅ | ❌ |
| Cloud fleet management | 🔵 Closed beta (see below) | ✅ |
| Self-hostable management server | 🔵 Planned, once stable | 🔴 Hosted only |

## 🛠️ Tech stack

- React Native + TypeScript
- Kotlin native modules (Android policy and system control)
- Android SDK 26+ (Android 8+)

## 🗺️ Roadmap snapshot

- `v1.2.x`: reliability and operational hardening (shipped)
- `v2.0.0-beta.x`: cloud fleet management, in closed beta
- `v2.0.0`: cloud out of beta, once the OTA update path, QR provisioning and Lock Mode behaviour are proven on real fleets
- later: the management server released for self-hosting

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