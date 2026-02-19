# FreeKiosk MQTT Documentation

FreeKiosk includes a native MQTT client for real-time integration with **Home Assistant** and other MQTT-based platforms.

## Overview

- **Protocol**: MQTT v3.1.1 (Eclipse Paho)
- **Default Port**: 1883
- **Discovery**: Home Assistant MQTT Discovery (auto-creates device + entities)
- **Push-based**: Real-time status updates (no polling needed)
- **LWT**: Availability tracking via Last Will and Testament

> **MQTT vs REST API**: MQTT is push-based — the tablet publishes status updates automatically every N seconds. The REST API requires polling. MQTT is the preferred integration for Home Assistant. Both can run simultaneously.

## Enabling MQTT

### Via UI
1. Open FreeKiosk Settings (5-tap + PIN)
2. Go to **Advanced** tab
3. Scroll to **MQTT** section
4. Enable **MQTT**
5. Enter your broker URL (e.g. `192.168.1.100`)
6. Configure port, username, password as needed
7. The connection status indicator shows Connected/Disconnected

### Via Backup/Restore
MQTT settings are included in FreeKiosk backup/restore. You can configure one device and export the configuration to others.

---

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| **Enable MQTT** | Off | Master toggle for MQTT client |
| **Broker URL** | *(empty)* | MQTT broker hostname or IP address (required) |
| **Port** | 1883 | MQTT broker port (1-65535) |
| **Username** | *(empty)* | MQTT username (optional) |
| **Password** | *(empty)* | MQTT password (stored in Android Keychain, optional) |
| **Client ID** | *(auto)* | MQTT client ID (auto-generated as `freekiosk_{deviceId}` if empty) |
| **Base Topic** | `freekiosk` | Base MQTT topic prefix for this device |
| **Discovery Prefix** | `homeassistant` | Home Assistant MQTT discovery prefix |
| **Status Interval** | 30 | How often to publish status (5-3600 seconds) |
| **Allow Remote Control** | On | Enable commands via MQTT (brightness, reload, etc.) |
| **Always-on Motion Detection** | Off | Run camera-based motion detection continuously (higher battery usage) |

---

## Topic Structure

For a device with `deviceId = abc123` and default base topic `freekiosk`:

| Purpose | Topic | QoS | Retained |
|---------|-------|-----|----------|
| Availability (LWT) | `freekiosk/abc123/availability` | 1 | Yes |
| State (all data) | `freekiosk/abc123/state` | 0 | Yes |
| Commands | `freekiosk/abc123/set/{entity}` | 1 | No |
| Discovery | `homeassistant/{component}/freekiosk_abc123/{objectId}/config` | 1 | Yes |

### Device ID

The `deviceId` is derived from `Settings.Secure.ANDROID_ID` — a unique identifier per device, stable across reboots.

### Availability

- **Online**: Published on successful connection (`"online"`, retained)
- **Offline**: Published via LWT on unexpected disconnect (`"offline"`, retained)
- **Graceful disconnect**: Publishes `"offline"` before disconnecting

### State

A JSON object published periodically (default: every 30 seconds) containing all device data:

```json
{
  "battery": {
    "level": 85,
    "charging": true
  },
  "screen": {
    "on": true,
    "brightness": 75,
    "screensaverActive": false
  },
  "wifi": {
    "ssid": "HomeNetwork",
    "signalLevel": 83,
    "ip": "192.168.1.50"
  },
  "device": {
    "ip": "192.168.1.50",
    "version": "1.2.12",
    "kioskMode": true,
    "isDeviceOwner": true
  },
  "sensors": {
    "light": 150.5
  },
  "memory": {
    "usedPercent": 41
  },
  "storage": {
    "availableMB": 27685
  },
  "audio": {
    "volume": 50
  },
  "webview": {
    "currentUrl": "http://192.168.1.244",
    "motionDetected": false
  }
}
```

---

## Home Assistant MQTT Discovery

FreeKiosk automatically publishes [MQTT Discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery) configurations on connect/reconnect. All entities appear under a single device in Home Assistant.

### Prerequisites

1. Home Assistant with [MQTT integration](https://www.home-assistant.io/integrations/mqtt/) configured
2. An MQTT broker (e.g. Mosquitto) accessible by both HA and the tablet
3. MQTT Discovery enabled in HA (enabled by default)

### Device

All entities are grouped under one HA device:

| Field | Value |
|-------|-------|
| Name | FreeKiosk {deviceId} |
| Model | FreeKiosk |
| Manufacturer | FreeKiosk |
| SW Version | *(app version)* |

### Entities

#### Sensors (11)

| Entity | Value Template | Device Class | Unit |
|--------|---------------|--------------|------|
| Battery Level | `battery.level` | battery | % |
| Brightness | `screen.brightness` | — | % |
| WiFi SSID | `wifi.ssid` | — | — |
| WiFi Signal | `wifi.signalLevel` | — | % |
| Light Sensor | `sensors.light` | illuminance | lx |
| IP Address | `device.ip` | — | — |
| App Version | `device.version` | — | — |
| Memory Used | `memory.usedPercent` | — | % |
| Storage Free | `storage.availableMB` | — | MB |
| Current URL | `webview.currentUrl` | — | — |
| Volume | `audio.volume` | — | % |

#### Binary Sensors (6)

| Entity | Value Template | Device Class |
|--------|---------------|--------------|
| Screen | `screen.on` | power |
| Screensaver | `screen.screensaverActive` | — |
| Battery Charging | `battery.charging` | battery_charging |
| Kiosk Mode | `device.kioskMode` | — |
| Device Owner | `device.isDeviceOwner` | — |
| Motion | `webview.motionDetected` | motion |

#### Number Controls (2)

| Entity | Command Topic | Min | Max | Unit |
|--------|--------------|-----|-----|------|
| Brightness Control | `.../set/brightness` | 0 | 100 | % |
| Volume Control | `.../set/volume` | 0 | 100 | % |

#### Switches (2)

| Entity | Command Topic | Payload |
|--------|--------------|---------|
| Screen Power | `.../set/screen` | ON / OFF |
| Screensaver | `.../set/screensaver` | ON / OFF |

#### Buttons (5)

| Entity | Command Topic | Icon |
|--------|--------------|------|
| Reload | `.../set/reload` | mdi:reload |
| Wake | `.../set/wake` | mdi:alarm |
| Reboot | `.../set/reboot` | mdi:restart |
| Clear Cache | `.../set/clear_cache` | mdi:delete-sweep |
| Lock | `.../set/lock` | mdi:lock |

#### Text (1)

| Entity | Command Topic | Description |
|--------|--------------|-------------|
| Navigate URL | `.../set/url` | Navigate WebView to a URL |

**Total: 27 entities** auto-discovered in Home Assistant.

---

## Command Reference

Commands are sent by publishing to `{baseTopic}/{deviceId}/set/{entity}`.

| Topic Suffix | Command | Payload | Description |
|-------------|---------|---------|-------------|
| `brightness` | setBrightness | `0-100` (integer) | Set screen brightness |
| `volume` | setVolume | `0-100` (integer) | Set media volume |
| `screen` | screenOn / screenOff | `ON` / `OFF` | Turn screen on or off |
| `screensaver` | screensaverOn / screensaverOff | `ON` / `OFF` | Enable/disable screensaver |
| `reload` | reload | any | Reload WebView |
| `wake` | wake | any | Wake from screensaver |
| `reboot` | reboot | any | Reboot device (Device Owner required) |
| `clear_cache` | clearCache | any | Clear WebView cache |
| `lock` | lockDevice | any | Lock device screen |
| `url` | setUrl | URL string | Navigate to URL |
| `tts` | tts | text string | Text-to-speech |
| `toast` | toast | text string | Show toast notification |
| `launch_app` | launchApp | package name | Launch external app |
| `execute_js` | executeJs | JS code string | Execute JavaScript in WebView |
| `audio_play` | audioPlay | JSON `{"url":"...","loop":false,"volume":50}` | Play audio from URL |
| `audio_stop` | audioStop | any | Stop audio playback |
| `audio_beep` | audioBeep | any | Play beep sound |
| `rotation_start` | rotationStart | any | Start URL rotation |
| `rotation_stop` | rotationStop | any | Stop URL rotation |
| `restart_ui` | restartUi | any | Restart app UI |

> Commands have full parity with the [REST API](REST_API.md). Both interfaces dispatch through the same command handler.

---

## Motion Detection

FreeKiosk can detect motion using the device camera and report it as a binary sensor in Home Assistant.

**Default behavior**: Motion detection only runs during screensaver (to wake the screen on movement).

**Always-on mode**: Enable "Always-on Motion Detection" in MQTT settings to run motion detection continuously. The `motion_detected` binary sensor will update in real-time. Note: this uses the camera continuously and increases battery usage.

> Camera permission must be granted for motion detection to work.

---

## Connection Behavior

### Auto-reconnect
The MQTT client automatically reconnects when the connection is lost (WiFi drop, broker restart). On reconnect, it:
1. Publishes `"online"` to the availability topic
2. Re-publishes all 27 HA Discovery configs
3. Re-subscribes to command topics
4. Resumes periodic status publishing

### LWT (Last Will and Testament)
If the connection is lost unexpectedly, the broker publishes `"offline"` to the availability topic. Home Assistant will show the device as "Unavailable".

### Concurrent with REST API
MQTT and the REST API can run simultaneously. Both use the same internal command handler and status data. Enabling MQTT does not disable the REST API.

---

## Testing with MQTT CLI

```bash
# Subscribe to all FreeKiosk topics
mosquitto_sub -h BROKER_IP -t "freekiosk/#" -v

# Check device availability
mosquitto_sub -h BROKER_IP -t "freekiosk/DEVICE_ID/availability"

# Read device state
mosquitto_sub -h BROKER_IP -t "freekiosk/DEVICE_ID/state"

# Set brightness to 50%
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/brightness" -m "50"

# Turn screen off
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/screen" -m "OFF"

# Turn screen on
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/screen" -m "ON"

# Navigate to URL
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/url" -m "https://example.com"

# Reload WebView
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/reload" -m "PRESS"

# Play audio
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/audio_play" -m '{"url":"https://example.com/sound.mp3","volume":50}'

# Text-to-speech
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/tts" -m "Hello from Home Assistant"

# Show toast
mosquitto_pub -h BROKER_IP -t "freekiosk/DEVICE_ID/set/toast" -m "Hello!"

# View HA discovery configs
mosquitto_sub -h BROKER_IP -t "homeassistant/#" -v
```

Replace `BROKER_IP` with your MQTT broker IP and `DEVICE_ID` with the device's Android ID (visible in the MQTT state JSON under `device.ip` or in the HA device page).

---

## Home Assistant Examples

### Automations

#### Wake tablet on room motion
```yaml
automation:
  - alias: "Wake Tablet on Room Motion"
    trigger:
      - platform: state
        entity_id: binary_sensor.freekiosk_abc123_motion
        to: "on"
    condition:
      - condition: state
        entity_id: binary_sensor.freekiosk_abc123_screensaver_active
        state: "on"
    action:
      - service: mqtt.publish
        data:
          topic: "freekiosk/abc123/set/wake"
          payload: "PRESS"
```

#### Turn off tablet screen at night
```yaml
automation:
  - alias: "Tablet Screen Off at Night"
    trigger:
      - platform: time
        at: "23:00:00"
    action:
      - service: mqtt.publish
        data:
          topic: "freekiosk/abc123/set/screen"
          payload: "OFF"
```

#### Turn on tablet screen in the morning
```yaml
automation:
  - alias: "Tablet Screen On in Morning"
    trigger:
      - platform: time
        at: "07:00:00"
    action:
      - service: mqtt.publish
        data:
          topic: "freekiosk/abc123/set/screen"
          payload: "ON"
```

#### Doorbell alert on tablet
```yaml
automation:
  - alias: "Doorbell Alert on Tablet"
    trigger:
      - platform: state
        entity_id: binary_sensor.doorbell
        to: "on"
    action:
      - service: mqtt.publish
        data:
          topic: "freekiosk/abc123/set/audio_beep"
          payload: "PRESS"
      - service: mqtt.publish
        data:
          topic: "freekiosk/abc123/set/toast"
          payload: "Someone is at the door!"
      - service: mqtt.publish
        data:
          topic: "freekiosk/abc123/set/url"
          payload: "http://homeassistant:8123/lovelace/cameras"
```

#### Adjust brightness based on room light
```yaml
automation:
  - alias: "Tablet Auto Brightness via MQTT"
    trigger:
      - platform: state
        entity_id: sensor.living_room_light_level
    action:
      - service: mqtt.publish
        data:
          topic: "freekiosk/abc123/set/brightness"
          payload: >-
            {{ (states('sensor.living_room_light_level') | float / 10) | int | min(100) }}
```

### Dashboard Card (Lovelace)

```yaml
type: entities
title: Tablet
entities:
  - entity: sensor.freekiosk_abc123_battery_level
  - entity: binary_sensor.freekiosk_abc123_battery_charging
  - entity: binary_sensor.freekiosk_abc123_screen_on
  - entity: number.freekiosk_abc123_brightness_control
  - entity: number.freekiosk_abc123_volume_control
  - entity: switch.freekiosk_abc123_screen_power
  - entity: switch.freekiosk_abc123_screensaver
  - entity: binary_sensor.freekiosk_abc123_motion_detected
  - entity: sensor.freekiosk_abc123_wifi_ssid
  - entity: sensor.freekiosk_abc123_wifi_signal
  - entity: button.freekiosk_abc123_reload
  - entity: button.freekiosk_abc123_wake
  - entity: button.freekiosk_abc123_reboot
```

---

## Troubleshooting

### Device not appearing in Home Assistant
1. Verify MQTT integration is configured in HA
2. Check that the broker URL is correct and reachable from the tablet
3. Check that MQTT Discovery is enabled in HA (Settings > Integrations > MQTT > Configure)
4. Use `mosquitto_sub -h BROKER_IP -t "homeassistant/#" -v` to verify discovery messages are being published

### Entities showing "Unknown"
- Wait for the first status publish (up to 30 seconds by default)
- Check the state topic: `mosquitto_sub -h BROKER_IP -t "freekiosk/DEVICE_ID/state"`
- For binary sensors, ensure the state JSON contains the expected boolean fields

### Connection keeps dropping
- Check WiFi stability on the tablet
- Verify broker allows the configured client ID
- Check if another client is using the same client ID (use a unique one)
- The client auto-reconnects automatically — brief disconnections are normal

### Screen Power switch flips back to ON
- This is resolved in the latest version. Ensure you're running v1.2.12+
- The tablet immediately publishes updated state after executing screen on/off commands

### Motion detection not working
- Grant camera permission to the app: Settings > Apps > FreeKiosk > Permissions > Camera
- By default, motion only activates during screensaver. Enable "Always-on Motion Detection" for continuous detection
- Check logs: `adb logcat | grep MotionDetection`

### WiFi SSID showing "WiFi" instead of real name
- Grant location permissions: Settings > Apps > FreeKiosk > Permissions > Location
- Android requires location permissions to read WiFi SSID (Android 8.0+)

---

## Technical Details

- **MQTT Library**: Eclipse Paho MQTT v3.1.1 (`org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5`)
- **Connection**: `MqttAsyncClient` with automatic reconnect
- **Clean Session**: Yes (no persistent subscriptions)
- **Keep Alive**: 30 seconds
- **Max In-flight**: 100 messages (supports publishing all 27 discovery configs at once)
- **Thread Safety**: MQTT callbacks are dispatched to the main thread via `Handler(Looper.getMainLooper())`
- **Password Storage**: Encrypted in Android Keychain (same as REST API key)

---

## See Also

- [REST API Documentation](REST_API.md) — HTTP-based integration (polling)
- [ADB Configuration Guide](ADB_CONFIG.md) — Headless provisioning via ADB
- [Installation Guide](INSTALL.md) — Device setup
