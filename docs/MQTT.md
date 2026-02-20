# FreeKiosk MQTT Documentation

FreeKiosk includes a native MQTT client for real-time integration with **Home Assistant** and other MQTT-based platforms.

## Overview

- **Protocol**: MQTT v5 / v3.1.1 (HiveMQ Client)
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
7. Press **Connect** button
8. The connection status indicator shows Connected/Disconnected

> Settings are saved automatically as you type. Connection is only established when you press "Connect" — no auto-reconnect on every keystroke.

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
| **Device Name** | *(empty)* | Friendly name used in MQTT topics and HA device name (e.g. "lobby", "entrance"). If empty, uses Android ID. |
| **Base Topic** | `freekiosk` | Base MQTT topic prefix for this device |
| **Discovery Prefix** | `homeassistant` | Home Assistant MQTT discovery prefix |
| **Status Interval** | 30 | How often to publish status (5-3600 seconds) |
| **Allow Remote Control** | On | Enable commands via MQTT (brightness, reload, etc.) |
| **Always-on Motion Detection** | Off | Run camera-based motion detection continuously (higher battery usage) |

---

## Topic Structure

For a device with `deviceName = lobby` (or `deviceId` if no name set) and default base topic `freekiosk`:

| Purpose | Topic | QoS | Retained |
|---------|-------|-----|----------|
| Availability (LWT) | `freekiosk/lobby/availability` | 1 | Yes |
| State (all data) | `freekiosk/lobby/state` | 0 | Yes |
| Commands | `freekiosk/lobby/set/{entity}` | 1 | No |
| Discovery | `homeassistant/{component}/freekiosk_{deviceId}/{objectId}/config` | 1 | Yes |

### Topic ID

The topic identifier is either the configured **Device Name** (sanitized: lowercased, spaces replaced with underscores) or the `ANDROID_ID` if no name is set. This makes topics human-readable when using device names (e.g. `freekiosk/lobby/state` instead of `freekiosk/9774d56d682e549c/state`).

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
    "isDeviceOwner": true,
    "motionAlwaysOn": false
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
| Name | FreeKiosk {deviceName} *(or FreeKiosk {deviceId} if no name set)* |
| Model | FreeKiosk |
| Manufacturer | FreeKiosk |
| SW Version | *(app version)* |
| Configuration URL | `http://{localIp}:8080` |

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

#### Switches (3)

| Entity | Command Topic | Payload |
|--------|--------------|---------|
| Screen Power | `.../set/screen` | ON / OFF |
| Screensaver | `.../set/screensaver` | ON / OFF |
| Always-on Motion Detection | `.../set/motion_always_on` | ON / OFF |

#### Buttons (5)

| Entity | Command Topic | Icon |
|--------|--------------|------|
| Reload | `.../set/reload` | mdi:reload |
| Wake | `.../set/wake` | mdi:alarm |
| Reboot | `.../set/reboot` | mdi:restart |
| Clear Cache | `.../set/clear_cache` | mdi:delete-sweep |
| Lock | `.../set/lock` | mdi:lock |

#### Text (3)

| Entity | Command Topic | Description |
|--------|--------------|-------------|
| Navigate URL | `.../set/url` | Navigate WebView to a URL |
| Text to Speech | `.../set/tts` | Speak text aloud on the tablet |
| Toast Message | `.../set/toast` | Show a toast notification on screen |

**Total: 30 entities** auto-discovered in Home Assistant.

---

## Command Reference

Commands are sent by publishing to `{baseTopic}/{topicId}/set/{entity}`.

| Topic Suffix | Command | Payload | Description |
|-------------|---------|---------|-------------|
| `brightness` | setBrightness | `0-100` (integer) | Set screen brightness |
| `volume` | setVolume | `0-100` (integer) | Set media volume |
| `screen` | screenOn / screenOff | `ON` / `OFF` | Turn screen on or off |
| `screensaver` | screensaverOn / screensaverOff | `ON` / `OFF` | Enable/disable screensaver |
| `motion_always_on` | setMotionAlwaysOn | `ON` / `OFF` | Toggle always-on motion detection |
| `reload` | reload | any | Reload WebView |
| `wake` | wake | any | Wake from screensaver |
| `reboot` | reboot | any | Reboot device (Device Owner required) |
| `clear_cache` | clearCache | any | Clear WebView cache |
| `lock` | lockDevice | any | Lock device screen |
| `url` | setUrl | URL string | Navigate to URL |
| `tts` | tts | text string | Text-to-speech (handled natively) |
| `toast` | toast | text string | Show toast notification (handled natively) |
| `launch_app` | launchApp | package name | Launch external app |
| `execute_js` | executeJs | JS code string | Execute JavaScript in WebView |
| `audio_play` | audioPlay | JSON `{"url":"...","loop":false,"volume":50}` | Play audio from URL |
| `audio_stop` | audioStop | any | Stop audio playback |
| `audio_beep` | audioBeep | any | Play beep sound |
| `rotation_start` | rotationStart | any | Start URL rotation |
| `rotation_stop` | rotationStop | any | Stop URL rotation |
| `restart_ui` | restartUi | any | Restart app UI |

> Commands have full parity with the [REST API](REST_API.md). Both interfaces dispatch through the same command handler. TTS and Toast are handled natively on the MQTT side (no JS round-trip).

---

## Motion Detection

FreeKiosk can detect motion using the device camera and report it as a binary sensor in Home Assistant.

**Default behavior**: Motion detection only runs during screensaver (to wake the screen on movement).

**Always-on mode**: Enable "Always-on Motion Detection" in MQTT settings or via the HA switch entity to run motion detection continuously. The `motion_detected` binary sensor will update in real-time. Note: this uses the camera continuously and increases battery usage.

> Camera permission must be granted for motion detection to work. FreeKiosk requests this permission automatically on first launch.

---

## Connection Behavior

### Auto-reconnect
The MQTT client automatically reconnects when the connection is lost (WiFi drop, broker restart). On reconnect, it:
1. Publishes `"online"` to the availability topic
2. Re-publishes all 30 HA Discovery configs
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
mosquitto_sub -h BROKER_IP -t "freekiosk/TOPIC_ID/availability"

# Read device state
mosquitto_sub -h BROKER_IP -t "freekiosk/TOPIC_ID/state"

# Set brightness to 50%
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/brightness" -m "50"

# Turn screen off
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/screen" -m "OFF"

# Turn screen on
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/screen" -m "ON"

# Navigate to URL
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/url" -m "https://example.com"

# Reload WebView
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/reload" -m "PRESS"

# Play audio
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/audio_play" -m '{"url":"https://example.com/sound.mp3","volume":50}'

# Text-to-speech
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/tts" -m "Hello from Home Assistant"

# Show toast
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/toast" -m "Hello!"

# Toggle always-on motion detection
mosquitto_pub -h BROKER_IP -t "freekiosk/TOPIC_ID/set/motion_always_on" -m "ON"

# View HA discovery configs
mosquitto_sub -h BROKER_IP -t "homeassistant/#" -v
```

Replace `BROKER_IP` with your MQTT broker IP and `TOPIC_ID` with the device name (e.g. `lobby`) or Android ID if no name is configured.

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
          topic: "freekiosk/lobby/set/wake"
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
          topic: "freekiosk/lobby/set/screen"
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
          topic: "freekiosk/lobby/set/screen"
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
          topic: "freekiosk/lobby/set/audio_beep"
          payload: "PRESS"
      - service: mqtt.publish
        data:
          topic: "freekiosk/lobby/set/toast"
          payload: "Someone is at the door!"
      - service: mqtt.publish
        data:
          topic: "freekiosk/lobby/set/url"
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
          topic: "freekiosk/lobby/set/brightness"
          payload: >-
            {{ (states('sensor.living_room_light_level') | float / 10) | int | min(100) }}
```

#### TTS announcement
```yaml
automation:
  - alias: "Announce Weather on Tablet"
    trigger:
      - platform: time
        at: "08:00:00"
    action:
      - service: mqtt.publish
        data:
          topic: "freekiosk/lobby/set/tts"
          payload: "Good morning! Today's forecast is {{ states('weather.home') }}."
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
  - entity: switch.freekiosk_abc123_motion_always_on
  - entity: binary_sensor.freekiosk_abc123_motion_detected
  - entity: text.freekiosk_abc123_tts
  - entity: text.freekiosk_abc123_toast
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
- Check the state topic: `mosquitto_sub -h BROKER_IP -t "freekiosk/TOPIC_ID/state"`
- For binary sensors, ensure the state JSON contains the expected boolean fields
- TTS and Toast entities always show empty — this is by design (fire-and-forget commands)

### Connection keeps dropping
- Check WiFi stability on the tablet
- Verify broker allows the configured client ID
- Check if another client is using the same client ID (use a unique one)
- The client auto-reconnects automatically — brief disconnections are normal

### Screen Power switch flips back to ON
- This is resolved in the latest version. Ensure you're running v1.2.12+
- The tablet immediately publishes updated state after executing screen on/off commands

### Motion detection not working
- Grant camera permission to the app (requested automatically on first launch)
- By default, motion only activates during screensaver. Enable "Always-on Motion Detection" for continuous detection
- Check logs: `adb logcat | grep MotionDetection`

### WiFi SSID showing "WiFi" instead of real name
- Grant location permissions (requested automatically on first launch)
- Android requires location permissions to read WiFi SSID (Android 8.0+)

### TTS not speaking
- Ensure the device has a TTS engine installed (most Android devices include Google TTS)
- Check device volume is not muted
- TTS is handled natively by the MQTT module — no need for the REST API to be running

---

## Technical Details

- **MQTT Library**: HiveMQ MQTT Client (`com.hivemq:hivemq-mqtt-client:1.3.12`)
- **Connection**: Automatic reconnect with exponential backoff
- **Clean Session**: Yes (no persistent subscriptions)
- **Keep Alive**: 30 seconds
- **Thread Safety**: MQTT callbacks are dispatched to the main thread via `Handler(Looper.getMainLooper())`
- **Password Storage**: Encrypted in Android Keychain (same as REST API key)
- **TTS & Toast**: Handled natively in the MQTT module (no JS round-trip)

---

## See Also

- [REST API Documentation](REST_API.md) — HTTP-based integration (polling)
- [ADB Configuration Guide](ADB_CONFIG.md) — Headless provisioning via ADB
- [Installation Guide](INSTALL.md) — Device setup
