

# FreeKiosk Roadmap and Changelog

**Recent release highlights plus medium-term product direction**

<p>
  <a href="README.md">Docs Home</a> •
  <a href="features-and-modes.md">Features</a> •
  <a href="development.md">Development</a>
</p>

## Table of Contents

- [Latest Releases](#latest-releases)
- [Product Roadmap](#product-roadmap)
- [Detailed Feature Progress](#detailed-feature-progress)
- [Development Progress](#development-progress)
- [How to Influence the Roadmap](#how-to-influence-the-roadmap)
- [Related Resources](#related-resources)




> [!IMPORTANT]
> Roadmap priorities can evolve; use issues and discussions for the latest planning signal.

## Latest Releases

| Version | Date | Channel | Highlights |
|---|---|---|---|
| **v2.1.0-beta.1** | 2026-10-24 | Beta | Android TV, Google TV and Fire TV; digital signage playlists from FreeKiosk Cloud (with web pages and YouTube); German, Italian, Dutch and Spanish |
| **v2.0.0** | 2026-10-22 | Stable | FreeKiosk Cloud (open beta), shared tablets, Brazilian Portuguese |

What is fixed on `main` and not released yet is listed under *Unreleased* in the [CHANGELOG](../CHANGELOG.md).

> [!NOTE]
> For complete release history and detailed notes, refer to GitHub releases:
>
> - [All Releases](https://github.com/rushb-fr/freekiosk/releases)

## Product Roadmap

> [!NOTE]
> There is no `v1.3.x`. The reliability and deployment work planned under that
> heading landed across the `v1.2.20` betas, and enabling the cloud took the next
> release to `2.0.0`. The items below carry forward whatever is still open.

### v1.2.x - Operational excellence (shipped)



| Focus Area | State |
|---|---|
| **Reliability** | Kiosk stability and error recovery, hardened across the 1.2.20 betas |
| **Deployment** | Remote control and provisioning tools expanded |
| **Media Workflows** | Media player and dashboard integration improved |
| **Monitoring** | Device health metrics, now also reported to the cloud |
| **Configuration** | Setup and management interfaces simplified |



### v2.0.0-beta.x - Cloud, in open beta



Shipped and in daily use, self-service sign-up while it is proven on real
fleets. The app remains free, MIT and fully usable without any cloud account.

| Area | State |
|---|---|
| **Enrollment** | Token from the dashboard, or zero-touch from a setup-wizard QR (Device Owner) |
| **Telemetry** | Battery, network, screen, storage, memory, uptime and capabilities, every 30 s |
| **Configuration** | Two-way sync, pushed per device or per group, applied without a restart |
| **Commands** | Reload, screensaver, TTS, audio, toast, JS, app launch, reboot, screenshot |
| **App updates** | Signed OTA install, silent as Device Owner |

The app shipped 2.0.0 as stable on 2026-10-22. FreeKiosk Cloud itself stays in
open beta: the OTA update path, the real provisioning QR, and Lock Mode
behaviour have had little exposure to varied hardware.

### Next - Cloud out of beta



| Focus Area | Planned |
|---|---|
| **Validation** | OTA updates, QR provisioning and Lock Mode proven across real fleets |
| **API** | A documented REST API so a customer's own systems can drive their fleet |
| **Analytics** | Usage insights and performance monitoring |
| **Security** | Enhanced authentication and access control |

### Later - Self-hosting



The management server is intended to be **released as open source so it can be
self-hosted**. A kiosk platform you cannot host yourself is only half free, so
this is the end state rather than an afterthought. It is being held back until
it is stable and feature-complete, and **no date is set**.



> [!NOTE]
> Roadmap items evolve over time; use issues/discussions for current prioritization:
> - [Issues](https://github.com/rushb-fr/freekiosk/issues)
> - [Discussions](https://github.com/rushb-fr/freekiosk/discussions)


## Detailed Feature Progress

### Current Status (v1.2.x)



| Feature | Status | Notes |
|---|---|---|
| **WebView Mode** | Complete | Full kiosk browser functionality |
| **External App Mode** | Complete | Lock to any Android app |
| **Dashboard Mode** | Complete | Multi-URL tile grid |
| **Media Player Mode** | Complete | Native media integration |
| **Device Owner** | Complete | Full device lockdown |
| **REST API** | Complete | 40+ endpoints |
| **MQTT Integration** | Complete | HA auto-discovery |
| **ADB Provisioning** | Complete | Headless deployment |
| **Motion Detection** | Complete | Camera-based sensing |
| **PIN Protection** | Complete | Secure settings access |
| **Auto-launch** | Complete | Boot-time startup |
| **Remote Control** | Complete | D-pad and keyboard |
| **Screenshot** | Complete | Screen capture API |
| **Camera Access** | Complete | Photo capture |
| **Audio Control** | Complete | Volume and playback |
| **Brightness Control** | Complete | Manual and auto |
| **WiFi Monitoring** | Complete | Network status |
| **Battery Monitoring** | Complete | Power status |
| **Storage Info** | Complete | Disk usage |
| **Memory Info** | Complete | RAM usage |
| **Location Services** | Complete | GPS coordinates |
| **Text-to-Speech** | Complete | Native TTS |
| **Toast Notifications** | Complete | System notifications |
| **Keyboard Emulation** | Complete | Cross-app input |
| **Auto-reconnect** | Complete | Network resilience |
| **Accessibility Service** | Complete | Enhanced control |
| **Settings UI** | Complete | Configuration interface |
| **Health Monitoring** | Complete | System health |
| **Debug Tools** | Complete | Troubleshooting aids |



### Feature status



| Feature | Status | Description |
|---|---|---|
| **URL Rotation** | Shipped | Cycles through a list of URLs |
| **Enhanced Media** | Shipped | Media player with playlists and playback controls |
| **Auto-brightness** | Shipped | Sensor-based adjustment |
| **App Management** | Shipped | External app control, single and multi-app modes |
| **Remote Configuration** | Shipped (open beta) | Pushed from FreeKiosk Cloud, per device or group |
| **Multi-language** | Shipped | English, French, German, Italian, Dutch, Spanish and Brazilian Portuguese; follows the device language unless one is chosen in Settings |
| **Content Filtering** | Shipped (1.2.8) | URL allow and block lists, in Website mode |
| **Advanced Analytics** | Planned | Usage metrics beyond the current live telemetry |
| **Enhanced Notifications** | Planned | Custom alerts |
| **Network Monitoring** | Planned | Advanced network stats |
| **Enhanced Security** | Planned | Access controls |
| **Theme Support** | Partly | Light or dark status bar only; no app theme yet |
| **Performance Metrics** | Planned | Device performance |
| **Backup/Restore** | Shipped (1.2.1) | Export and import of the configuration as a file |
| **Scheduled Tasks** | Partly | URL Planner (1.2.0), screen sleep schedule, scheduled signage playlists (2.1.0-beta.1); no scheduled reboot yet |
| **Device Groups** | Shipped (open beta) | In FreeKiosk Cloud, one group per device |
| **Debug Console** | Planned | Advanced debugging |
| **Real-time Logs** | Planned | Live log streaming |
| **Game Mode** | Planned | Gaming optimizations |
| **Video Streaming** | Planned | Enhanced media |
| **Usage Reports** | Planned | Analytics dashboard |
| **Plugin System** | Planned | Extensible architecture |



### Future Vision (v2.x)



| Feature | Status | Description |
|---|---|---|
| **Cloud Management** | Shipped (open beta) | FreeKiosk Cloud, see [cloud.md](cloud.md) |
| **Enterprise Features** | Planned | Corporate deployment tools |
| **Advanced Integrations** | Planned | Third-party platform support |
| **Localization** | Shipped | 7 languages in the app (2.1.0-beta.1) |
| **Analytics Platform** | Planned | Comprehensive insights |
| **Enterprise Security** | Planned | Advanced authentication |
| **AI Features** | Planned | Smart automation |
| **Cross-platform** | Planned | iOS support exploration |
| **Developer API** | Planned | Extensible development |
| **Business Intelligence** | Planned | Usage analytics |
| **Web Dashboard** | Shipped (open beta) | The FreeKiosk Cloud dashboard |
| **Automation Engine** | Planned | Rule-based automation |
| **Device Templates** | Shipped (open beta) | Configuration profiles in FreeKiosk Cloud, per device or group |
| **Maintenance Mode** | Planned | Service management |
| **Performance Optimization** | Planned | System enhancements |
| **Custom Workflows** | Planned | User-defined processes |
| **API Gateway** | Planned | Unified API access |
| **Monitoring Suite** | Planned | Comprehensive monitoring |
| **Advanced Debugging** | Planned | Developer tools |
| **Business Logic** | Planned | Enterprise features |
| **Global Deployment** | Planned | Worldwide support |




## Development Progress



| Metric | Current | Target | Status |
|---|---|---|---|
| **API Endpoints** | 40+ | 50+ | On Track |
| **MQTT Entities** | 42 | 50+ | On Track |
| **Platform Support** | Android 8+ | Android 7+ | Research |
| **Languages** | 7 (EN, FR, DE, ES, IT, NL, PT-BR) | EN, FR, DE, ES | Complete |
| **Device Models** | 20+ | 50+ | On Track |
| **Test Coverage** | 70% | 85% | Planned |
| **Documentation** | 95% | 100% | Complete |
| **Feature Completeness** | 85% | 95% | On Track |




## How to Influence the Roadmap



| Method | How to Participate | Impact |
|---|---|---|
| **Report Issues** | [GitHub Issues](https://github.com/rushb-fr/freekiosk/issues) | Bug fixes and improvements |
| **Join Discussions** | [GitHub Discussions](https://github.com/rushb-fr/freekiosk/discussions) | Feature ideas and feedback |
| **Feature Requests** | Create detailed issue with use case | Prioritization consideration |
| **Test Beta Releases** | Join beta channel | Early feedback and testing |
| **Share Use Cases** | Document your deployment scenarios | Feature development guidance |
| **Contribute Code** | [Development Guide](development.md) | Direct feature implementation |
| **Provide Metrics** | Share performance and usage data | Performance improvements |




## Related Resources



| Resource | Link | Purpose |
|---|---|---|
| **GitHub Releases** | [All Releases](https://github.com/rushb-fr/freekiosk/releases) | Download latest version |
| **Issue Tracker** | [GitHub Issues](https://github.com/rushb-fr/freekiosk/issues) | Report bugs and request features |
| **Discussions** | [GitHub Discussions](https://github.com/rushb-fr/freekiosk/discussions) | Community feedback |
| **Contributing** | [Contributing Guide](../CONTRIBUTING.md) | How to contribute code |
| **Development** | [Development Guide](development.md) | Setup and contribution |
| **Documentation** | [Docs Home](README.md) | Complete documentation |








