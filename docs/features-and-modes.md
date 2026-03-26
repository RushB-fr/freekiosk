# Features and Modes

**Understanding FreeKiosk's display modes and capabilities**

[Docs Home](README) • [Installation](Installation) • [Integrations](Integrations)


> [!TIP]
> Choose your operational mode first, then proceed to [Installation](Installation) and [Integrations](Integrations).

## Table of Contents

- [Display Modes](#display-modes)
- [Security & Control](#security--control)
- [Provisioning & Operations](#provisioning--operations)
- [Choosing Your Mode](#choosing-your-mode)


## Display Modes

### WebView Mode

**Display any website in fullscreen kiosk mode.**

**Capabilities:**
- Any HTTPS/HTTP URL
- SSL support (including self-signed certificates)
- Fullscreen immersive experience
- Perfect for Home Assistant dashboards

**Best for:**
- Home Assistant dashboards
- Information displays
- Web-based applications
- Digital signage
- Corporate dashboards

### External App Mode

**Lock the tablet to a specific Android application.**

**Capabilities:**
- Lock to any installed Android app
- Auto-relaunch on exit/crash
- Test mode for safe deployment
- 5-tap gesture + PIN for settings access

**Best for:**
- Cloud gaming (Steam Link, Xbox Cloud Gaming)
- Digital signage apps
- Corporate applications
- Media players
- Custom Android apps

### Dashboard Mode

**Multi-URL tile grid for quick navigation between multiple dashboards.**

**Capabilities:**
- Configurable tile grid
- One-tap navigation between URLs
- Auto-return to dashboard after inactivity
- Custom names and URLs for each tile

**Best for:**
- Multi-dashboard environments
- Resource collections
- Quick access portals
- Control centers
- Multiple Home Assistant views

### Media Mode

**Enhanced media playback and multi-app support.**

**Capabilities:**
- Native media player integration
- Multi-app switching
- Time-based content scheduling
- Performance monitoring

**Best for:**
- Video playback
- Audio streaming
- Media galleries
- Scheduled content rotation

> [!NOTE]
> See [Roadmap and Changelog](Roadmap-and-Changelog) for detailed release information.


## Security & Control

### Lockdown Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| **Basic** | WebView kiosk with minimal restrictions | Testing, personal use |
| **Standard** | External app with navigation blocking | Single-app deployments |
| **Enterprise** | Device Owner full lockdown | Production, public kiosks |

### Security Features

- **Device Owner Mode** - Complete device control
- **Navigation Blocking** - Disable home, recent apps, settings
- **Overlay Prevention** - Block system dialogs and notifications
- **Watchdog Service** - Automatic recovery and monitoring
- **PIN Protection** - Secure settings access
- **Screen Pinning** - Task locking policies


## Provisioning & Operations

### Deployment Methods

| Method | Tools | Scale | Guide |
|--------|-------|-------|-------|
| **Manual** | Touch interface | Single device | [Installation](Installation) |
| **ADB Script** | Command line | Small batches | [ADB Config](ADB-Configuration) |
| **MDM Integration** | Enterprise tools | Large fleets | Coming soon |

### Operational Features

- **ADB Provisioning** - Headless scripted deployment
- **Configuration Backup** - Save/restore complete settings
- **Auto-launch** - Boot-time automatic startup
- **Keep-alive** - Continuous monitoring and recovery
- **Remote Control** - REST API and MQTT automation
- **Mass Deployment** - Configure multiple devices via scripts


## Choosing Your Mode

### Quick Decision Guide

| Use Case | Recommended Mode | Setup Guide |
|----------|------------------|-------------|
| **Home Assistant Dashboard** | WebView Mode | [Installation](Installation) |
| **Cloud Gaming Kiosk** | External App + Device Owner | [ADB Configuration](ADB-Configuration) |
| **Corporate Kiosk** | External App + Device Owner | [Installation](Installation) |
| **Multi-Dashboard** | Dashboard Mode | [Installation](Installation) |
| **Media Display** | Media Mode | [Installation](Installation) |
| **Custom Android App** | External App Mode | [ADB Configuration](ADB-Configuration) |

### Configuration Examples

**Home Assistant Dashboard:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://homeassistant.local:8123" \
    --es pin "1234"
```

**Cloud Gaming Kiosk:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "com.valvesoftware.steamlink" \
    --es pin "1234" \
    --es test_mode "false"
```

**Corporate Information Display:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://dashboard.company.com" \
    --es pin "0000" \
    --es rest_api_enabled "true"
```


## Next Steps

- **Installation:** [Complete setup guide](Installation)
- **Integrations:** [REST API and MQTT](Integrations)
- **ADB Provisioning:** [Headless deployment](ADB-Configuration)
- **FAQ:** [Common questions](FAQ)
