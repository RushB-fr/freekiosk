# Integrations

**Connect FreeKiosk to your automation stack**

[Docs Home](README.md) • [REST API](rest-api.md) • [MQTT](MQTT.md)


> [!IMPORTANT]
> REST API and MQTT can run simultaneously on the same device.

## Table of Contents

- [Integration Channels](#integration-channels)
- [REST API](#rest-api)
- [MQTT](#mqtt)
- [ioBroker](#iobroker)
- [Headless Setup](#headless-setup)
- [Choosing Your Integration](#choosing-your-integration)


## Integration Channels

FreeKiosk offers two main integration methods:

| Channel | Best For | Documentation |
|---------|----------|---------------|
| **REST API** | On-demand control via HTTP | [REST API Docs](rest-api.md) |
| **MQTT** | Real-time telemetry + Home Assistant | [MQTT Docs](MQTT.md) |

For ioBroker there is a dedicated adapter that uses either channel, see [ioBroker](#iobroker).

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

# Watch the live camera stream (enable it first in Settings > Advanced > REST API)
ffplay "http://tablet-ip:8080/api/camera/stream?camera=front&fps=10"
```

> [!TIP]
> See the complete [REST API Reference](rest-api.md) for all endpoints.

### Using the Tablet as a Camera

A wall-mounted tablet is often the only device already installed in a room. With **Live Camera Stream** enabled, its camera shows up in Home Assistant through the *MJPEG IP Camera* integration:



| Field | Value |
|---|---|
| **MJPEG URL** | `http://TABLET_IP:8080/api/camera/stream?camera=front&fps=10` |
| **Still image URL** | `http://TABLET_IP:8080/api/camera/photo?camera=front` |
| **Username / Password** | anything / your API key, if one is set |



```yaml
# Or in configuration.yaml
camera:
  - platform: mjpeg
    name: Lobby Kiosk
    mjpeg_url: http://TABLET_IP:8080/api/camera/stream?camera=front&fps=10
    still_image_url: http://TABLET_IP:8080/api/camera/photo?camera=front
```

> [!NOTE]
> Wake-on-motion keeps working while the stream runs: a camera accepts a single client, so movement is measured on the stream's own frames instead. Nothing to configure, and the sensitivity you chose still applies. The only difference in practice is that a colour change at constant brightness goes unnoticed, since only the luma plane is compared.

> [!TIP]
> MJPEG is not free: budget ~5 Mbit/s and about two thirds of a CPU core at 1280×960, quality 60, 10 fps. For plain monitoring, 5 fps and quality 50 look nearly identical for half the cost. For still images only, the [MQTT camera entities](MQTT.md#-images-screenshot--camera) are far cheaper.


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
> See the complete [MQTT Reference](MQTT.md) for topics and commands.


## ioBroker

**Tablet states and commands as ioBroker objects, via the [ioBroker.freekiosk](https://github.com/typhosj/ioBroker.freekiosk) adapter.**

The adapter turns each tablet into a device in ioBroker: battery, screen, brightness, volume, current URL, Wi-Fi and sensors as states, and the commands (reload, wake, URL, screensaver, text-to-speech, screenshots, camera photos, remote keys, display mode and more) as writable states for scripts, Blockly and vis. It needs FreeKiosk 2.0.0 or newer.

### Choosing the Transport

Each tablet is added to the adapter's device table with one of two transports:

| Transport | How it works | FreeKiosk side |
|-----------|--------------|----------------|
| **REST** | The adapter polls the tablet (default every 30 s) | Enable the [REST API](rest-api.md), optionally with an API key |
| **MQTT** | The tablet pushes to a broker built into the adapter, no Mosquitto needed | Point the [MQTT](MQTT.md) settings at the ioBroker host |

Motion detection and periodic screenshots or camera photos are only available over MQTT. Screenshots and camera photos on demand work over both.

### FreeKiosk Settings

- **Allow Remote Control** must be on, otherwise the tablet refuses every command. REST API and MQTT each have their own switch; turn on the one of the transport you use.
- **MQTT:** broker = the ioBroker host, port = the adapter's broker port (default `1886`), the same username, password and base topic as in the adapter. The adapter's broker requires a username and a password. The **Device Name** is the topic ID you enter in the adapter's device table.
- **MQTT images:** screenshots and camera photos arrive only for the streams turned on in FreeKiosk's MQTT settings (**Publish Screenshot**, **Publish Camera Snapshots**).

The adapter's broker ignores the Home Assistant discovery messages, so nothing has to be turned off. FreeKiosk connects to one broker only, though: if Home Assistant already uses the tablet over MQTT, add the tablet to ioBroker over REST.

> [!TIP]
> Setup steps, the device table and the full list of states are in the [adapter README](https://github.com/typhosj/ioBroker.freekiosk#readme).


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
> See the complete [ADB Configuration Guide](adb-configuration.md) for all parameters.


## Choosing Your Integration

### Decision Guide

| Use Case | Recommended | Why |
|----------|-------------|-----|
| **Home Assistant** | MQTT | Auto-discovery + real-time |
| **ioBroker** | [ioBroker.freekiosk](#iobroker) adapter | Ready-made states and commands, over REST or MQTT |
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

- **REST API:** [Complete endpoint reference](rest-api.md)
- **MQTT:** [Topics, discovery, and commands](MQTT.md)
- **ioBroker:** [ioBroker.freekiosk adapter](https://github.com/typhosj/ioBroker.freekiosk#readme)
- **ADB Configuration:** [Headless provisioning](adb-configuration.md)
- **Installation:** [Device setup guide](installation.md)
- **FAQ:** [Common questions](faq.md)
