

# 🔌 FreeKiosk Integrations

**Connect FreeKiosk to your automation stack with REST and MQTT, or both together**

<p>
  <a href="README.md">📚 Docs Home</a> •
  <a href="rest-api.md">🌐 REST API</a> •
  <a href="MQTT.md">📡 MQTT</a>
</p>



> [!IMPORTANT]
> REST and MQTT can run simultaneously on the same device.

## 🤖 Home Assistant and Automation

FreeKiosk supports two main integration channels for seamless automation:



| 🔌 Channel | 🎯 Best When | 📖 Reference |
|---|---|---|
| **🌐 REST API** | Request/response control on demand | [REST API Documentation](REST-API) |
| **📡 MQTT** | Push telemetry + Home Assistant discovery | [MQTT Documentation](MQTT) |



### 🔄 Integration Overview



| ⚡ Feature | 🌐 REST API | 📡 MQTT |
|---|---|---|
| **🎛️ Control** | Request/response | Push commands |
| **📊 Telemetry** | Polling endpoints | Real-time publishing |
| **🏠 HA Discovery** | Manual setup | Auto-discovery |
| **📱 Availability** | HTTP status | LWT (Last Will) |
| **🔐 Security** | API key auth | Username/password |



## 🌐 REST API

Perfect for on-demand control and monitoring through HTTP requests.



### ✨ Key Features

| ⚡ Capability | 📋 Details |
|---|---|
| **🔧 40+ Endpoints** | Complete device control |
| **📊 Device Status** | Real-time sensor data |
| **🎮 Navigation Control** | URL and app switching |
| **📸 Media Capture** | Screenshot & camera access |
| **🔐 API Security** | Optional API key authentication |



### 🎯 Use Cases



| 🎭 Scenario | 🌐 REST API Advantage |
|---|---|
| **🏠 Home Assistant** | Direct HTTP integration |
| **📱 Mobile Apps** | RESTful API calls |
| **🔧 Scripts** | Simple curl/wget commands |
| **🌐 Web Dashboards** | JavaScript fetch() calls |



### 📖 Quick Start

```bash
# Get device status
curl -H "X-Api-Key: your-key" http://tablet-ip:8080/api/status

# Navigate to new URL
curl -X POST -H "X-Api-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://new-dashboard.com"}' \
  http://tablet-ip:8080/api/navigate

# Take screenshot
curl -H "X-Api-Key: your-key" http://tablet-ip:8080/api/screenshot
```

> [!NOTE]
> For complete endpoint reference, see [REST API Documentation](REST-API).

## 📡 MQTT

Ideal for real-time automation and Home Assistant auto-discovery.



### ✨ Key Features

| ⚡ Capability | 📋 Details |
|---|---|
| **🔄 MQTT Protocol** | v5 / v3.1.1 support |
| **🏠 HA Discovery** | Auto-configuration in Home Assistant |
| **📱 Availability** | LWT (Last Will Testament) status |
| **📊 Telemetry** | Real-time sensor publishing |
| **🎮 Remote Control** | Command subscription topics |



### 🎯 Use Cases



| 🎭 Scenario | 📡 MQTT Advantage |
|---|---|
| **🏠 Home Assistant** | Auto-discovery + real-time updates |
| **📊 Monitoring** | Continuous telemetry streams |
| **🔔 Notifications** | Event-based automation |
| **🌐 Multi-device** | Central broker management |



### 📖 Quick Start

```yaml
# Home Assistant configuration.yaml
mqtt:
  broker: your-broker-ip
  port: 1883
  discovery: true
  discovery_prefix: homeassistant
```

**MQTT Topics Structure:**
```
freekiosk/tablet1/status/online      # Device availability
freekiosk/tablet1/sensor/battery      # Battery level
freekiosk/tablet1/signal/rssi         # WiFi strength
freekiosk/tablet1/command/navigate    # URL navigation
freekiosk/tablet1/command/reload      # Page reload
```

> [!NOTE]
> For complete MQTT configuration, see [MQTT Documentation](MQTT).

## ⚙️ Headless Setup

Configure integrations without UI using ADB intent parameters for mass deployment.



### 🛠️ ADB Configuration Options

| ⚙️ Parameter | 🌐 REST API | 📡 MQTT |
|---|---|---|
| **`rest_api_enabled`** | `"true"` | - |
| **`rest_api_port`** | `"8080"` | - |
| **`rest_api_key`** | `"your-secret-key"` | - |
| **`mqtt_enabled`** | - | `"true"` |
| **`mqtt_broker_url`** | - | `"broker-ip"` |
| **`mqtt_port`** | - | `"1883"` |
| **`mqtt_username`** | - | `"username"` |
| **`mqtt_password`** | - | `"password"` |
| **`mqtt_discovery_prefix`** | - | `"homeassistant"` |



### 🎯 Example Commands



**REST API Only:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es rest_api_key "my-secret-key" \
    --es pin "1234"
```

**MQTT Only:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es mqtt_enabled "true" \
    --es mqtt_broker_url "192.168.1.100" \
    --es mqtt_username "homeassistant" \
    --es mqtt_password "mqtt-password" \
    --es pin "1234"
```

**Both Together:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es rest_api_key "my-secret-key" \
    --es mqtt_enabled "true" \
    --es mqtt_broker_url "192.168.1.100" \
    --es mqtt_username "homeassistant" \
    --es mqtt_password "mqtt-password" \
    --es pin "1234"
```



> [!NOTE]
> For complete ADB provisioning guide, see [ADB Configuration Guide](ADB-Configuration).

---

## 🎯 Choosing Your Integration



| 🎭 Use Case | 🔌 Recommended Integration | 🎯 Why |
|---|---|---|
| **🏠 Home Assistant** | **MQTT** | Auto-discovery + real-time updates |
| **📱 Mobile App Control** | **REST API** | Simple HTTP requests |
| **📊 Monitoring Dashboard** | **REST API** | Polling for status |
| **🔔 Event-Driven Automation** | **MQTT** | Push-based notifications |
| **🌐 Web Integration** | **REST API** | JavaScript fetch() friendly |
| **🏭 Multi-Device Fleet** | **MQTT** | Central broker management |
| **🔧 Simple Scripts** | **REST API** | Easy curl commands |
| **🔄 Real-time Control** | **Both** | MQTT for events, REST for commands |



### 🔄 Hybrid Approach



**Best of both worlds:**
- **📡 MQTT** for continuous telemetry and Home Assistant discovery
- **🌐 REST API** for on-demand commands and media capture
- **⚙️ ADB** for initial provisioning and bulk configuration



---

## 🔗 Related Documentation



| 📚 Document | 🎯 Focus |
|---|---|
| **🌐 REST API** | [Complete endpoint reference](REST-API) |
| **📡 MQTT** | [MQTT configuration and topics](MQTT) |
| **⌨️ ADB Configuration** | [Scripted provisioning guide](ADB-Configuration) |
| **🔧 Installation** | [Device setup instructions](Installation) |
| **❓ FAQ** | [Common integration questions](FAQ) |



---



**Made with ❤️ by [FreeKiosk Team](https://freekiosk.app)**


