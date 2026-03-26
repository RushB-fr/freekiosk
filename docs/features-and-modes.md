

# 🧭 FreeKiosk Features and Modes

**A quick map of how FreeKiosk can run, lock, and present content on Android tablets**

<p>
  <a href="README.md">📚 Docs Home</a> •
  <a href="installation.md">🔧 Installation</a> •
  <a href="INTEGRATIONS.md">🔗 Integrations</a>
</p>



> [!TIP]
> Use this page to choose your operational mode first, then jump to setup and automation guides.

## 🎛️ Core Features



| ✅ Feature | 📋 Description |
|---|---|
| **🌐 Kiosk Browser Mode** | WebView-based web content display |
| **📱 External App Mode** | Lock to a specific Android application |
| **🏢 Device Owner Support** | Enterprise-grade full device lockdown |
| **🔐 PIN Protection** | Secure settings access with authentication |
| **📌 Screen Pinning** | Optional task locking policies |



## 🖥️ Display Modes

### 🌐 WebView Mode



**Perfect for dashboards, web apps, and websites**

| ⚡ Capability | 📋 Details |
|---|---|
| **🔗 URL Display** | Any HTTPS/HTTP website or dashboard |
| **🔒 SSL Support** | Including self-signed certificates |
| **📱 Immersive** | Fullscreen kiosk experience |
| **🏠 Home Assistant** | Native integration with HA dashboards |



**Best for:**
- Home Assistant dashboards
- Information displays
- Web-based applications
- Digital signage

### 📱 External App Mode



**Lock device to a specific Android application**

| ⚡ Capability | 📋 Details |
|---|---|
| **🎯 App Locking** | Lock to any installed Android app |
| **🔄 Auto-relaunch** | Automatic app restart on exit/crash |
| **🧪 Test Mode** | Safe deployment with back button access |
| **🔐 Secure Access** | 5-tap gesture + PIN for settings |



**Best for:**
- Cloud gaming (Steam Link, Xbox Cloud Gaming)
- Digital signage apps
- Corporate applications
- Media players

### 📊 Dashboard Mode



**Multi-URL tile grid for quick navigation**

| ⚡ Capability | 📋 Details |
|---|---|
| **🔷 Tile Grid** | Multiple configurable URL tiles |
| **👆 One-tap Navigation** | Quick access to different resources |
| **⏰ Inactivity Return** | Auto-return to dashboard after timeout |
| **🎨 Customizable** | Custom names and URLs for each tile |



**Best for:**
- Multi-dashboard environments
- Resource collections
- Quick access portals
- Control centers

### 🎬 Media / Multi-App Enhancements



**Advanced features for media and multi-app deployments**

Recent versions include significant improvements for:

- **🎥 Media Player Integration** - Enhanced video and audio playback
- **📱 Multi-App Support** - Switch between multiple applications
- **🎯 Advanced Scheduling** - Time-based content switching
- **📊 Performance Monitoring** - Resource usage tracking



> [!NOTE]
> For detailed release information, see [Roadmap and Changelog](Roadmap-and-Changelog).

## 🔐 Security and Control



| 🛡️ Security Feature | 📋 Protection Level |
|---|---|
| **🏢 Device Owner** | Complete device control and lockdown |
| **🚫 Navigation Blocking** | Disable home, recent, settings access |
| **📱 Overlay Prevention** | Block system dialogs and notifications |
| **🐕 Watchdog Service** | Automatic kiosk recovery and monitoring |



### 🔒 Lockdown Levels



| 🔒 Level | 📋 Description | 🎯 Use Case |
|---|---|---|
| **Basic** | WebView kiosk with minimal restrictions | Simple displays |
| **Standard** | External app with navigation blocking | Single-app deployments |
| **Enterprise** | Device Owner full lockdown | Corporate/public kiosks |



## ⚙️ Provisioning and Operations



| 🚀 Operational Feature | 📋 Capability |
|---|---|
| **⌨️ ADB Provisioning** | Headless scripted deployment |
| **💾 Configuration Backup** | Save/restore complete settings |
| **🚀 Auto-launch** | Boot-time automatic startup |
| **🔄 Keep-alive** | Continuous monitoring and recovery |
| **📡 Remote Control** | REST API and MQTT automation |



### 🎯 Deployment Methods



| 📋 Method | 🛠️ Tools | 📏 Scale |
|---|---|---|
| **Manual** | Touch interface | Single device |
| **ADB Script** | Command line | Small batches |
| **MDM Integration** | Enterprise tools | Large fleets |



---

## 🎯 Choosing Your Mode



| 🎭 Use Case | 🎯 Recommended Mode | 🔧 Setup Guide |
|---|---|---|
| **🏠 Home Dashboard** | WebView Mode | [Installation](Installation) |
| **🎮 Cloud Gaming** | External App + Device Owner | [ADB Configuration](ADB-Configuration) |
| **🏢 Corporate Kiosk** | External App + Enterprise Lock | [Installation Guide](Installation) |
| **📊 Multi-Dashboard** | Dashboard Mode | [Installation](Installation) |
| **🎬 Media Display** | Media Mode | [Roadmap](Roadmap-and-Changelog) |



---



**Made with ❤️ by [FreeKiosk Team](https://freekiosk.app)**


