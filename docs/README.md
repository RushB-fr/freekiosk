<div align="center">

# FreeKiosk Documentation

**Free open-source kiosk mode for Android tablets**

_Complete guides for deployment, automation, and integration_

<p>
  <img src="https://img.shields.io/badge/Version-1.2.17-blue.svg" alt="Version 1.2.17">
  <a href="https://github.com/rushb-fr/freekiosk/releases"><img src="https://img.shields.io/github/downloads/rushb-fr/freekiosk/total.svg" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  <img src="https://img.shields.io/badge/Android-8.0%2B-green.svg" alt="Android 8.0+">
</p>

</div>


## What is FreeKiosk?

FreeKiosk is a **free, open-source kiosk platform** for Android tablets. It's designed for teams and individuals who need **full device control without licensing costs**.

**Perfect for:**
- Home Assistant dashboards
- Corporate information displays
- Cloud gaming kiosks (Steam Link, Xbox Cloud Gaming)
- Digital signage
- Hotel/restaurant tablets
- Industrial control panels

### Why Choose FreeKiosk?

- **100% Free** - No per-device costs, no subscriptions, MIT licensed
- **Complete Lockdown** - Device Owner mode for enterprise-grade security
- **Multiple Modes** - WebView, External App, Dashboard, Media Player
- **Rich Automation** - 40+ REST API endpoints + MQTT with Home Assistant auto-discovery
- **Mass Deployment** - ADB-based headless provisioning
- **Privacy First** - No tracking, no cloud dependencies

### FreeKiosk vs Fully Kiosk Browser

| Feature | FreeKiosk | Fully Kiosk |
|---------|:---------:|:-----------:|
| **Price** | Free | €7.90/device |
| **Open Source** | MIT | Closed |
| **Device Owner** | Yes | Yes |
| **REST API** | 40+ endpoints | Yes |
| **MQTT + HA Discovery** | Yes | No |
| **Cloud Management** | Roadmap | Yes |


## Quick Start

### Basic Installation (5 minutes)

1. Download the latest APK from [**Releases**](https://github.com/rushb-fr/freekiosk/releases)
2. Install on your Android 8.0+ tablet
3. Configure URL and PIN
4. Start kiosk mode

### Production Deployment (Device Owner)

For complete lockdown with no system interruptions:

```bash
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver
```

> [!TIP]
> See the complete [Installation Guide](Installation) for detailed setup instructions.


## Documentation Guide

### Getting Started

| Guide | Description | Link |
|-------|-------------|------|
| **Installation** | Complete setup guide from basic to Device Owner mode | [Read →](Installation) |
| **Features & Modes** | Understand WebView, External App, Dashboard modes | [Read →](Features-and-Modes) |
| **FAQ** | Common questions and troubleshooting | [Read →](FAQ) |

### Integration & Automation

| Reference | Scope | Link |
|---|---|---|
| ADB Configuration | Headless provisioning and scripts | [Open](adb-configuration.md) |
| REST API | Endpoints and payloads | [Open](rest-api.md) |
| MQTT | Topics, discovery, commands | [Open](MQTT.md) |
| Production CI/CD | Nightly build and release promotion setup | [Open](production-pipeline-readme.md) |
| Roadmap and Changelog | Release highlights and direction | [Open](roadmap-and-changelog.md) |
| Development | Local setup and build flow | [Open](development.md) |
| Pipeline and Wiki Sync | Docs publication workflow | [Open](pipeline-and-wiki-sync.md) |

### Advanced Topics

| Guide | Description | Link |
|-------|-------------|------|
| **Development** | Build and contribute to FreeKiosk | [Read →](Development) |
| **Roadmap & Changelog** | Release notes and future plans | [Read →](Roadmap-and-Changelog) |
| **Wiki Sync** | How documentation is published | [Read →](Pipeline-and-Wiki-Sync) |


## Common Use Cases

### Home Assistant Dashboard
```bash
# Configure via ADB
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://homeassistant.local:8123" \
    --es pin "1234" \
    --es mqtt_enabled "true" \
    --es mqtt_broker_url "192.168.1.100"
```

### Cloud Gaming Kiosk
```bash
# Lock to Steam Link with auto-relaunch
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "com.valvesoftware.steamlink" \
    --es pin "1234" \
    --es test_mode "false" \
    --ez auto_start true
```

### Information Display
```bash
# Simple URL kiosk with REST API
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://dashboard.company.com" \
    --es pin "0000" \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080"
```


## Resources

- **Website:** [freekiosk.app](https://freekiosk.app)
- **Releases:** [GitHub Releases](https://github.com/rushb-fr/freekiosk/releases)
- **Issues:** [Report Bugs](https://github.com/rushb-fr/freekiosk/issues)
- **Discussions:** [Community Forum](https://github.com/rushb-fr/freekiosk/discussions)
- **Support:** support@freekiosk.app


## Contributing

FreeKiosk is open source and welcomes contributions!

- **Code:** [Contributing Guide](https://github.com/rushb-fr/freekiosk/blob/main/CONTRIBUTING.md)
- **Documentation:** Submit PRs to improve these docs
- **Feedback:** Share your use case in [Discussions](https://github.com/rushb-fr/freekiosk/discussions)


<div align="center">

**Made with ❤️ by [Rushb](https://rushb.fr)**

</div>
