# FreeKiosk REST API Documentation

FreeKiosk includes a built-in REST API server for integration with **Home Assistant** and other smart home platforms.

## Overview

- **Default Port**: 8080
- **Protocol**: HTTP (HTTPS planned)
- **Authentication**: Optional API Key (X-Api-Key header)
- **Format**: JSON responses

> 💡 **Note**: Some API features require **Device Owner mode** for full functionality (true screen off, reboot). The HTTP server remains accessible even when the screen is off (v1.2.4+). See [Installation Guide](INSTALL.md#advanced-install-device-owner-mode) for Device Owner setup instructions.

## Enabling the API

### Via UI
1. Open FreeKiosk Settings (5-tap on secret button → PIN)
2. Go to **Advanced** tab
3. Enable **REST API**
4. Configure port and optional API key
5. Save settings

### Via ADB (Headless)
```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es pin "1234" \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es rest_api_key "your_secret_key"
```

See [ADB Configuration Guide](ADB_CONFIG.md) for full headless provisioning.

---

## Endpoints Reference

### Status & Info (GET)

#### `GET /api/status`
Returns complete device status in one call.

```json
{
  "success": true,
  "data": {
    "battery": { "level": 85, "charging": true, "temperature": 25.5 },
    "screen": { "on": true, "brightness": 75, "screensaverActive": false },
    "webview": { "currentUrl": "http://...", "canGoBack": false, "loading": false },
    "device": { "model": "SM-T510", "manufacturer": "samsung", "android": "11" },
    "wifi": { "connected": true, "ssid": "Home", "rssi": -45, "ip": "192.168.1.50" },
    "sensors": { "light": 150.5, "proximity": 5, "accelerometer": {...} },
    "autoBrightness": { "enabled": true, "min": 10, "max": 100, "currentLightLevel": 150.5 },
    "kiosk": { "enabled": true, "pinEnabled": true },
    "audio": { "volume": 50 },
    "storage": { "totalMB": 32000, "availableMB": 15000 },
    "memory": { "totalMB": 4096, "availableMB": 2048 }
  },
  "timestamp": 1704672000
}
```

#### `GET /api/battery`
```json
{
  "success": true,
  "data": {
    "level": 85,
    "charging": true,
    "temperature": 25.5,
    "health": "good"
  }
}
```

#### `GET /api/brightness`
```json
{
  "success": true,
  "data": { "brightness": 75 }
}
```

#### `GET /api/screen`
```json
{
  "success": true,
  "data": {
    "on": true,
    "brightness": 75,
    "screensaverActive": false
  }
}
```

#### `GET /api/sensors`
Returns light, proximity, and accelerometer data.
```json
{
  "success": true,
  "data": {
    "light": 150.5,
    "proximity": 5,
    "accelerometer": { "x": 0.1, "y": 0.2, "z": 9.8 }
  }
}
```

#### `GET /api/storage`
```json
{
  "success": true,
  "data": {
    "totalMB": 32000,
    "availableMB": 15000,
    "usedMB": 17000,
    "usedPercent": 53
  }
}
```

#### `GET /api/memory`
```json
{
  "success": true,
  "data": {
    "totalMB": 4096,
    "availableMB": 2048,
    "usedMB": 2048,
    "usedPercent": 50,
    "lowMemory": false
  }
}
```

#### `GET /api/wifi`
```json
{
  "success": true,
  "data": {
    "connected": true,
    "ssid": "HomeNetwork",
    "rssi": -45,
    "ip": "192.168.1.50"
  }
}
```

#### `GET /api/info`
Device information.
```json
{
  "success": true,
  "data": {
    "model": "SM-T510",
    "manufacturer": "samsung",
    "android": "11",
    "appVersion": "1.2.2"
  }
}
```

#### `GET /api/health`
Simple health check.
```json
{
  "success": true,
  "data": { "status": "ok" }
}
```

#### `GET /api/screenshot`
Returns a PNG image of the current screen.

**Response**: `image/png` binary data

---

### Control Commands (POST)

#### `POST /api/brightness`
Set screen brightness (disables auto-brightness if enabled).
```json
{ "value": 75 }
```

#### `POST /api/autoBrightness/enable`
Enable automatic brightness adjustment based on ambient light sensor.
```json
{ "min": 10, "max": 100 }
```
- `min`: Minimum brightness percentage (0-100, default: 10)
- `max`: Maximum brightness percentage (0-100, default: 100)

> 💡 Uses a logarithmic curve for natural perception. Brightness is calculated based on ambient light level (10-1000 lux range).

#### `POST /api/autoBrightness/disable`
Disable automatic brightness and restore previous manual brightness setting.

#### `GET /api/autoBrightness`
Get current auto-brightness status.
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "min": 10,
    "max": 100,
    "currentLightLevel": 250.5
  }
}
```

#### `POST /api/screen/on`
Turn screen on / wake device.

#### `POST /api/screen/off`
Turn screen off.

> ⚠️ **Device Owner Required for Full Screen Control**
> 
> | Feature | Without Device Owner | With Device Owner |
> |---------|---------------------|-------------------|
> | `screen/off` | ⚠️ Dims to 0% brightness (screen stays on) | ✅ Actually turns off screen via `lockNow()` |
> | `screen/on` | Restores brightness | Wakes device from sleep |
> | Screen state detection | ✅ Works (physical button detected) | ✅ Works (all methods detected) |
> | HTTP Server availability | ✅ Always accessible (v1.2.4+) | ✅ Always accessible |
> | `reboot` | ❌ Not available | ✅ Works |
> 
> **Why can't regular apps turn off the screen?**  
> Android security prevents non-system apps from turning off the screen to protect against malicious apps. Only Device Owner apps have this privilege via `DevicePolicyManager.lockNow()`. Without Device Owner, `/api/screen/off` can only dim the screen to minimum brightness.
> 
> **Workaround**: Use the physical power button to turn off the screen, then use `/api/screen/on` to turn it back on remotely.
> 
> To enable Device Owner mode, see [Installation Guide](INSTALL.md#advanced-install-device-owner-mode).

#### `POST /api/screensaver/on`
Activate screensaver mode.

#### `POST /api/screensaver/off`
Deactivate screensaver mode.

#### `POST /api/reload`
Reload the current WebView page.

#### `POST /api/url`
Navigate to a new URL.
```json
{ "url": "https://example.com" }
```

#### `POST /api/wake`
Wake from screensaver.

#### `POST /api/tts`
Text-to-speech.
```json
{ "text": "Hello World" }
```

#### `POST /api/volume`
Set media volume (0-100).
```json
{ "value": 50 }
```

#### `POST /api/toast`
Show a toast notification.
```json
{ "text": "Message displayed!" }
```

#### `POST /api/js`
Execute JavaScript in WebView.
```json
{ "code": "alert('Hello!')" }
```

#### `POST /api/clearCache`
Clear WebView cache and reload.

#### `POST /api/app/launch`
Launch an external app.
```json
{ "package": "com.spotify.music" }
```

#### `POST /api/reboot`
Reboot device (requires Device Owner mode).

---

### Audio Control (POST)

#### `POST /api/audio/play`
Play audio from URL.
```json
{
  "url": "https://example.com/sound.mp3",
  "loop": false,
  "volume": 50
}
```

#### `POST /api/audio/stop`
Stop currently playing audio.

#### `POST /api/audio/beep`
Play a short beep sound.

---

### Remote Control - Android TV (POST)

Perfect for controlling Android TV devices or navigating apps.

| Endpoint | Key |
|----------|-----|
| `POST /api/remote/up` | D-pad Up |
| `POST /api/remote/down` | D-pad Down |
| `POST /api/remote/left` | D-pad Left |
| `POST /api/remote/right` | D-pad Right |
| `POST /api/remote/select` | Select/Enter |
| `POST /api/remote/back` | Back |
| `POST /api/remote/home` | Home |
| `POST /api/remote/menu` | Menu |
| `POST /api/remote/playpause` | Play/Pause |

---

## Authentication

If an API key is configured, include it in requests:

```bash
curl -H "X-Api-Key: your-api-key" http://tablet-ip:8080/api/status
```

---

## Home Assistant Integration

### Basic Sensors

```yaml
# configuration.yaml

rest:
  - resource: http://TABLET_IP:8080/api/status
    scan_interval: 30
    sensor:
      - name: "Tablet Battery"
        value_template: "{{ value_json.data.battery.level }}"
        unit_of_measurement: "%"
        device_class: battery
      
      - name: "Tablet Brightness"
        value_template: "{{ value_json.data.screen.brightness }}"
        unit_of_measurement: "%"
      
      - name: "Tablet Light Sensor"
        value_template: "{{ value_json.data.sensors.light | round(0) }}"
        unit_of_measurement: "lx"
        device_class: illuminance
      
      - name: "Tablet WiFi Signal"
        value_template: "{{ value_json.data.wifi.rssi }}"
        unit_of_measurement: "dBm"
        device_class: signal_strength

    binary_sensor:
      - name: "Tablet Screen"
        value_template: "{{ value_json.data.screen.on }}"
        device_class: power
      
      - name: "Tablet Charging"
        value_template: "{{ value_json.data.battery.charging }}"
        device_class: battery_charging
      
      - name: "Tablet Screensaver"
        value_template: "{{ value_json.data.screen.screensaverActive }}"
```

### REST Commands

```yaml
rest_command:
  tablet_screen_on:
    url: http://TABLET_IP:8080/api/screen/on
    method: POST
  
  tablet_screen_off:
    url: http://TABLET_IP:8080/api/screen/off
    method: POST
  
  tablet_brightness:
    url: http://TABLET_IP:8080/api/brightness
    method: POST
    content_type: "application/json"
    payload: '{"value": {{ brightness }}}'
  
  tablet_navigate:
    url: http://TABLET_IP:8080/api/url
    method: POST
    content_type: "application/json"
    payload: '{"url": "{{ url }}"}'
  
  tablet_reload:
    url: http://TABLET_IP:8080/api/reload
    method: POST
  
  tablet_tts:
    url: http://TABLET_IP:8080/api/tts
    method: POST
    content_type: "application/json"
    payload: '{"text": "{{ message }}"}'
  
  tablet_volume:
    url: http://TABLET_IP:8080/api/volume
    method: POST
    content_type: "application/json"
    payload: '{"value": {{ volume }}}'
  
  tablet_beep:
    url: http://TABLET_IP:8080/api/audio/beep
    method: POST
  
  tablet_toast:
    url: http://TABLET_IP:8080/api/toast
    method: POST
    content_type: "application/json"
    payload: '{"text": "{{ message }}"}'
  
  tablet_screensaver_on:
    url: http://TABLET_IP:8080/api/screensaver/on
    method: POST
  
  tablet_screensaver_off:
    url: http://TABLET_IP:8080/api/screensaver/off
    method: POST
```

### Screenshot Camera

```yaml
camera:
  - platform: generic
    name: "Tablet Screenshot"
    still_image_url: http://TABLET_IP:8080/api/screenshot
    content_type: image/png
```

### Example Automations

#### Auto-brightness based on room light
```yaml
automation:
  - alias: "Tablet Auto Brightness"
    trigger:
      - platform: state
        entity_id: sensor.living_room_light_level
    action:
      - service: rest_command.tablet_brightness
        data:
          brightness: "{{ (states('sensor.living_room_light_level') | float / 10) | int | min(100) }}"
```

#### Turn off screen at night
```yaml
automation:
  - alias: "Tablet Screen Off at Night"
    trigger:
      - platform: time
        at: "23:00:00"
    action:
      - service: rest_command.tablet_screensaver_on
```

#### Wake tablet on motion
```yaml
automation:
  - alias: "Wake Tablet on Motion"
    trigger:
      - platform: state
        entity_id: binary_sensor.living_room_motion
        to: "on"
    condition:
      - condition: state
        entity_id: binary_sensor.tablet_screensaver
        state: "on"
    action:
      - service: rest_command.tablet_screensaver_off
```

#### Doorbell notification
```yaml
automation:
  - alias: "Doorbell Alert on Tablet"
    trigger:
      - platform: state
        entity_id: binary_sensor.doorbell
        to: "on"
    action:
      - service: rest_command.tablet_beep
      - service: rest_command.tablet_toast
        data:
          message: "Someone is at the door!"
      - service: rest_command.tablet_navigate
        data:
          url: "http://homeassistant:8123/lovelace/cameras"
```

---

## Testing with cURL

```bash
# Get status
curl http://TABLET_IP:8080/api/status

# Set brightness
curl -X POST -H "Content-Type: application/json" \
  -d '{"value": 50}' http://TABLET_IP:8080/api/brightness

# Play beep
curl -X POST http://TABLET_IP:8080/api/audio/beep

# Save screenshot
curl http://TABLET_IP:8080/api/screenshot -o screenshot.png

# Show toast
curl -X POST -H "Content-Type: application/json" \
  -d '{"text": "Hello!"}' http://TABLET_IP:8080/api/toast
```

---

## Error Responses

```json
{
  "success": false,
  "error": "Error message",
  "timestamp": 1704672000
}
```

Common errors:
- `401 Unauthorized` - Invalid or missing API key
- `403 Forbidden` - Control commands disabled
- `404 Not Found` - Unknown endpoint
- `500 Internal Error` - Server error

---

## See Also

- [ADB Configuration Guide](ADB_CONFIG.md) - Headless provisioning via ADB
- [MDM Specification](MDM_SPEC.md) - Enterprise deployment
- [Installation Guide](INSTALL.md) - Manual setup

---

## Changelog

### v1.2.0
- Initial REST API release
- 40+ endpoints for full device control
- Home Assistant integration ready
- Sensors: battery, brightness, light, proximity, storage, memory, WiFi
- Controls: screen, brightness, volume, audio, navigation, remote
- Screenshot capture
- Audio playback (URL, beep)
