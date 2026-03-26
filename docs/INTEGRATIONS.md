# Integrations

**Connect FreeKiosk to your automation stack**

[Docs Home](README) • [REST API](REST-API) • [MQTT](MQTT)


> [!IMPORTANT]
> REST API and MQTT can run simultaneously on the same device.

## Table of Contents

- [Integration Channels](#integration-channels)
- [REST API](#rest-api)
- [MQTT](#mqtt)
- [Headless Setup](#headless-setup)
- [Choosing Your Integration](#choosing-your-integration)


## Integration Channels

FreeKiosk offers two main integration methods:

| Channel | Best For | Documentation |
|---------|----------|---------------|
| **REST API** | On-demand control via HTTP | [REST API Docs](REST-API) |
| **MQTT** | Real-time telemetry + Home Assistant | [MQTT Docs](MQTT) |

### Feature Comparison

| Feature | REST API | MQTT |
|---------|:--------:|:----:|
| **Control Method** | Request/response | Push commands |
| **Telemetry** | Polling | Real-time |
| **HA Discovery** | Manual | Auto |
| **Availability** | HTTP status | LWT |
| **Security** | API key | Username/password |


## REST API

**HTTP-based control for on-demand device management.**

### Key Features

- **40+ Endpoints** - Complete device control
- **Device Status** - Real-time sensor data
- **Navigation Control** - URL and app switching
- **Media Capture** - Screenshot & camera access
- **API Security** - Optional API key authentication

### Best For

- Home Assistant HTTP integration
- Mobile app control
- Shell scripts (curl/wget)
- Web dashboards (JavaScript)

### Quick Start

```bash
# Get device status
curl -H "X-Api-Key: your-key" http://tablet-ip:8080/api/status

# Navigate to new URL
curl -X POST -H "X-Api-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://new-dashboard.com"}' \
  http://tablet-ip:8080/api/url

# Take screenshot
curl -H "X-Api-Key: your-key" http://tablet-ip:8080/api/screenshot -o screenshot.png
```

> [!TIP]
> See the complete [REST API Reference](REST-API) for all endpoints.


## MQTT

**Real-time telemetry and Home Assistant auto-discovery.**

### Key Features

- **MQTT Protocol** - v5 / v3.1.1 support
- **HA Discovery** - Auto-configuration in Home Assistant
- **Availability** - LWT (Last Will Testament) status
- **Telemetry** - Real-time sensor publishing
- **Remote Control** - Command subscription topics

### Best For

- Home Assistant integration (auto-discovery)
- Continuous monitoring
- Event-based automation
- Multi-device management

### Quick Start

**Home Assistant configuration:**
```yaml
mqtt:
  broker: your-broker-ip
  port: 1883
  discovery: true
  discovery_prefix: homeassistant
```

**Topic structure:**
```
freekiosk/lobby/availability         # Device online/offline
freekiosk/lobby/state                # All sensor data (JSON)
freekiosk/lobby/set/brightness       # Set brightness command
freekiosk/lobby/set/url              # Navigate to URL
```

> [!TIP]
> See the complete [MQTT Reference](MQTT) for topics and commands.


## Headless Setup

**Configure integrations via ADB for mass deployment.**

### Configuration Parameters

**REST API:**
- `rest_api_enabled` - Enable REST API (`"true"`)
- `rest_api_port` - API port (`"8080"`)
- `rest_api_key` - API authentication key

**MQTT:**
- `mqtt_enabled` - Enable MQTT (`"true"`)
- `mqtt_broker_url` - Broker IP/hostname
- `mqtt_port` - Broker port (`"1883"`)
- `mqtt_username` - MQTT username
- `mqtt_password` - MQTT password
- `mqtt_discovery_prefix` - HA discovery prefix (`"homeassistant"`)

### Example Commands

**REST API only:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es rest_api_key "my-secret-key" \
    --es pin "1234"
```

**MQTT only:**
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es mqtt_enabled "true" \
    --es mqtt_broker_url "192.168.1.100" \
    --es mqtt_username "homeassistant" \
    --es mqtt_password "mqtt-password" \
    --es pin "1234"
```

**Both together:**
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
> See the complete [ADB Configuration Guide](ADB-Configuration) for all parameters.


## Choosing Your Integration

### Decision Guide

| Use Case | Recommended | Why |
|----------|-------------|-----|
| **Home Assistant** | MQTT | Auto-discovery + real-time |
| **Mobile App** | REST API | Simple HTTP requests |
| **Monitoring** | REST API | Polling for status |
| **Event Automation** | MQTT | Push-based notifications |
| **Web Integration** | REST API | JavaScript friendly |
| **Multi-Device Fleet** | MQTT | Central broker |
| **Scripts** | REST API | Easy curl commands |
| **Real-time Control** | Both | Best of both worlds |

### Hybrid Approach

Use both for maximum flexibility:

- **MQTT** - Continuous telemetry and HA discovery
- **REST API** - On-demand commands and media capture
- **ADB** - Initial provisioning and bulk configuration


## Related Documentation

- **REST API:** [Complete endpoint reference](REST-API)
- **MQTT:** [Topics, discovery, and commands](MQTT)
- **ADB Configuration:** [Headless provisioning](ADB-Configuration)
- **Installation:** [Device setup guide](Installation)
- **FAQ:** [Common questions](FAQ)
