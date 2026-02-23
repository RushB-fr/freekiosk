# FreeKiosk ADB Configuration Guide

Configure FreeKiosk via ADB commands for automated deployment and headless provisioning.

## Overview

FreeKiosk supports configuration via Android Debug Bridge (ADB) intent extras, enabling:
- **Automated device provisioning** without UI interaction
- **Mass deployment** across multiple devices
- **Dynamic configuration** changes via scripts
- **CI/CD integration** for testing

## Security Model

| Device State | Requirements |
|--------------|-------------|
| **Virgin setup** (no PIN configured) | PIN **must be provided** in the command |
| **Already configured** | Existing PIN **required** to modify |

This ensures:
- ✅ First-time setup is scriptable with PIN protection
- ✅ Configured devices cannot be hijacked via ADB
- ✅ Factory reset re-enables ADB provisioning

---

## Quick Start

### First-Time Setup (New Device)

```bash
# Set Device Owner (one-time, requires fresh device or factory reset)
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver

# Configure and lock to external app
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "com.example.myapp" \
    --es pin "1234"
```

**Note**: Setting Device Owner is **highly recommended** for external app locking as it allows FreeKiosk to automatically manage all required permissions including "Display over other apps". Without Device Owner, this permission must be granted manually through Settings.

### Configure WebView Kiosk

```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://your-dashboard.com" \
    --es pin "1234"
```

**Note**: WebView mode doesn't require Device Owner as it doesn't need overlay permissions.

---

## Command Reference

### Basic Syntax

```bash
adb shell am start -n com.freekiosk/.MainActivity [OPTIONS]
```

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `--es pin "XXXX"` | String | **Always required**. PIN for authentication (new or existing) |

### App Lock Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `--es lock_package "com.app"` | String | Package name of app to lock device to |
| `--ez auto_start true` | Boolean | Auto-launch the locked app after config |

### WebView Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `--es url "https://..."` | String | URL to display in kiosk WebView |

### Kiosk Mode Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--ez kiosk_enabled true` | Boolean | `true` | Enable/disable kiosk mode |
| `--ez auto_start true` | Boolean | - | Auto-launch the locked app after config |
| `--es auto_launch "true"` | String | - | Auto-launch on boot (alternative to `auto_start`) |
| `--es auto_relaunch "true"` | String | - | Auto-relaunch if app crashes/exits |
| `--es test_mode "false"` | String | `"true"` | `"false"` = production (sets `back_button_mode` to `immediate`). `"true"` = testing (sets `back_button_mode` to `test`). Shortcut for `back_button_mode` |
| `--es back_button_mode "immediate"` | String | `"test"` | Behavior when returning to FreeKiosk via Android back button: `"test"` (stay on FreeKiosk, back button allowed), `"timer"` (countdown then relaunch app), `"immediate"` (instantly relaunch app). If `test_mode` is also set, `back_button_mode` takes priority |
| `--es status_bar "true"` | String | - | Show custom status bar |

### Password Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--es pin_mode "numeric"` | String | `numeric` | PIN input mode: `numeric` (4-6 digits) or `alphanumeric` (letters, numbers, special chars) |

### REST API Options

| Parameter | Type | Description |
|-----------|------|-------------|
| `--es rest_api_enabled "true"` | String | Enable REST API server |
| `--es rest_api_port "8080"` | String | API server port |
| `--es rest_api_key "secret"` | String | API authentication key |

### MQTT Options

| Parameter | Type | Description |
|-----------|------|-------------|
| `--es mqtt_enabled "true"` | String | Enable MQTT client |
| `--es mqtt_broker_url "host"` | String | MQTT broker hostname or IP |
| `--es mqtt_port "1883"` | String | MQTT broker port |
| `--es mqtt_username "user"` | String | MQTT authentication username |
| `--es mqtt_password "pass"` | String | MQTT authentication password (stored securely in Keychain) |
| `--es mqtt_client_id "id"` | String | MQTT client ID (auto-generated if empty) |
| `--es mqtt_base_topic "freekiosk"` | String | Base MQTT topic prefix |
| `--es mqtt_discovery_prefix "homeassistant"` | String | Home Assistant MQTT discovery prefix |
| `--es mqtt_status_interval "30"` | String | Status publish interval in seconds |
| `--es mqtt_allow_control "true"` | String | Allow remote control via MQTT |
| `--es mqtt_device_name "name"` | String | Friendly device name for HA discovery |

### Screensaver Options

| Parameter | Type | Description |
|-----------|------|-------------|
| `--es screensaver_enabled "true"` | String | Enable screensaver on inactivity |

---

## Waiting for Configuration Completion

The ADB command returns immediately, but FreeKiosk needs time to save settings and restart. **Use broadcast receivers to wait for completion**:

### TypeScript/JavaScript Example

```typescript
private async setupKioskModeUsingFreeKiosk(packageName: string): Promise<void> {
  console.log(`Setting up kiosk mode for ${packageName}...`);

  // Start listening for EXTERNAL_APP_LAUNCHED broadcast
  const appLaunchMonitor = this.execAsync(
    `adb -s ${this.adbTarget} logcat -c && adb -s ${this.adbTarget} logcat -s "FreeKiosk-ADB" | grep -m 1 "EXTERNAL_APP_LAUNCHED: ${packageName}"`
  );

  // Send configuration command with auto_start
  const kioskCmd = `adb -s ${this.adbTarget} shell am start -n com.freekiosk/.MainActivity --es lock_package "${packageName}" --es pin "${PIN}" --ez auto_start true`;
  await this.execAsync(kioskCmd);

  // Wait for external app to be launched and visible (timeout after 30s)
  console.log("Waiting for app to launch...");
  await Promise.race([
    appLaunchMonitor,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('App launch timeout after 30s')), 30000)
    )
  ]);

  console.log(`✅ ${packageName} is now running and ready!`);
  // Start sending video/content here
}
```

### Bash Script Example

```bash
#!/bin/bash
PACKAGE="com.example.app"
PIN="1234"

# Monitor logcat for completion marker in background
adb logcat -c
adb logcat -s "FreeKiosk-ADB" | grep -m 1 "SETTINGS_LOADED" &
LOGCAT_PID=$!

# Send configuration
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "$PACKAGE" \
    --es pin "$PIN" \
    --ez auto_start true

# Wait for completion (with 30s timeout)
timeout 30 wait $LOGCAT_PID

echo "Configuration complete!"
```

### Broadcast Events

FreeKiosk emits these broadcasts during ADB configuration:

| Broadcast Action | When | Description |
|-----------------|------|-------------|
| `com.freekiosk.ADB_CONFIG_SAVED` | Immediately after config saved | Database write complete, restart imminent |
| `com.freekiosk.ADB_CONFIG_RESTARTING` | Just before restart | Process kill in 500ms |
| `com.freekiosk.SETTINGS_LOADED` | After restart complete | App restarted and settings loaded successfully |
| `com.freekiosk.EXTERNAL_APP_LAUNCHED` | After external app launch (auto_start=true) | External app is launched and visible (includes package_name extra) |

**For WebView mode**: Wait for `SETTINGS_LOADED`  
**For External App mode with auto_start**: Wait for `EXTERNAL_APP_LAUNCHED` to know when the app is ready to receive content

### Waiting for External App Launch

```bash
#!/bin/bash
PACKAGE="com.example.app"
PIN="1234"

# Monitor for external app launch
adb logcat -c
adb logcat -s "FreeKiosk-ADB" | grep -m 1 "EXTERNAL_APP_LAUNCHED: $PACKAGE" &
LOGCAT_PID=$!

# Configure and auto-launch
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "$PACKAGE" \
    --es pin "$PIN" \
    --ez auto_start true

# Wait for app to be visible (with 30s timeout)
timeout 30 wait $LOGCAT_PID

echo "✅ $PACKAGE is now running and ready!"
# Start sending video/content here
```

---

## Examples

### 1. Cloud Gaming Kiosk

Lock device to a game streaming app with auto-relaunch (production mode):

```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "com.valvesoftware.steamlink" \
    --es pin "1234" \
    --es auto_relaunch "true" \
    --es test_mode "false" \
    --ez auto_start true
```

> **Note**: `test_mode "false"` sets `back_button_mode` to `immediate`, meaning the Android back button will instantly relaunch the app. Omit it or set to `"true"` during testing to allow the back button to return to FreeKiosk without auto-relaunch.

### 2. Hotel Room Tablet

Display hotel dashboard with REST API for Home Assistant:

```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://hotel.local/dashboard" \
    --es pin "5678" \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es rest_api_key "hotel_secret_key" \
    --es screensaver_enabled "true"
```

### 3. Restaurant Menu Display

Simple URL kiosk:

```bash
adb shell am start -n com.freekiosk/.MainActivity \
    --es url "https://menu.restaurant.com" \
    --es pin "0000" \
    --es status_bar "false"
```

### 4. Full JSON Configuration

For complex setups, use a JSON config. Note that shell escaping can be tricky - using individual parameters is often easier:

```bash
# Linux/Mac - use single quotes for JSON
adb shell am start -n com.freekiosk/.MainActivity \
    --es pin "1234" \
    --es config '{"lock_package":"com.app","auto_relaunch":"true"}'

# Or use individual parameters (recommended for shell scripts)
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "com.app" \
    --es auto_relaunch "true" \
    --es status_bar "true" \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es pin "1234"
```

### 5. Modify Existing Configuration

Change the locked app on an already-configured device:

```bash
# Must use the existing PIN
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "com.newapp.package" \
    --es pin "1234"
```

---

## JSON Configuration Format

When using `--es config '{...}'`, the following keys are supported:

```json
{
  "url": "https://example.com",
  "lock_package": "com.example.app",
  "display_mode": "external_app",
  "kiosk_enabled": "true",
  "auto_launch": "true",
  "auto_relaunch": "true",
  "screensaver_enabled": "true",
  "screensaver_delay": "300000",
  "screensaver_brightness": "10",
  "status_bar_enabled": "true",
  "status_bar_show_battery": "true",
  "status_bar_show_wifi": "true",
  "status_bar_show_time": "true",
  "rest_api_enabled": "true",
  "rest_api_port": "8080",
  "rest_api_key": "your_api_key",
  "allow_power_button": "false",
  "back_button_mode": "immediate",
  "test_mode": "false",
  "default_brightness": "75",
  "mqtt_enabled": "true",
  "mqtt_broker_url": "broker.local",
  "mqtt_port": "1883",
  "mqtt_username": "user",
  "mqtt_password": "password",
  "mqtt_client_id": "tablet1",
  "mqtt_base_topic": "freekiosk",
  "mqtt_discovery_prefix": "homeassistant",
  "mqtt_status_interval": "30",
  "mqtt_allow_control": "true",
  "mqtt_device_name": "Kitchen Tablet"
}
```

---

## Complete Provisioning Script

Here's a complete bash script for provisioning a new device:

```bash
#!/bin/bash
# provision_kiosk.sh - Provision a FreeKiosk device

PACKAGE="com.cloudgaming.app"
PIN="1234"
API_KEY="my_secret_key"

echo "🔧 Setting Device Owner..."
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver

echo "⏳ Waiting for device..."
sleep 2

echo "� Granting Usage Stats permission (required for foreground monitoring)..."
adb shell appops set com.freekiosk android:get_usage_stats allow

echo "�📱 Configuring FreeKiosk..."
adb shell am start -n com.freekiosk/.MainActivity \
    --es lock_package "$PACKAGE" \
    --es pin "$PIN" \
    --es auto_relaunch "true" \
    --es test_mode "false" \
    --es rest_api_enabled "true" \
    --es rest_api_port "8080" \
    --es rest_api_key "$API_KEY" \
    --ez auto_start true

echo "✅ Device provisioned!"
echo "   Locked to: $PACKAGE"
echo "   REST API: http://<device-ip>:8080"
```

---

## PowerShell Script (Windows)

```powershell
# provision_kiosk.ps1 - Provision a FreeKiosk device (Windows)

$Package = "com.cloudgaming.app"
$Pin = "1234"
$ApiKey = "my_secret_key"

Write-Host "🔧 Setting Device Owner..."
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver

Start-Sleep -Seconds 2

Write-Host "� Granting Usage Stats permission..."
adb shell appops set com.freekiosk android:get_usage_stats allow

Write-Host "�📱 Configuring FreeKiosk..."
# Note: JSON escaping in PowerShell is complex, use individual parameters
adb shell am start -n com.freekiosk/.MainActivity `
    --es lock_package $Package `
    --es auto_relaunch "true" `
    --es test_mode "false" `
    --es rest_api_enabled "true" `
    --es rest_api_port "8080" `
    --es rest_api_key $ApiKey `
    --es pin $Pin `
    --ez auto_start true

Write-Host "✅ Device provisioned!"
```

---

## Troubleshooting

### Error: "PIN required for first setup"

**Cause**: Device has no PIN configured, but none was provided.

**Solution**: Add `--es pin "XXXX"` to your command.

### Error: "PIN required" / "Invalid PIN"

**Cause**: Device already configured, wrong or missing PIN.

**Solution**: Use the existing PIN configured on the device.

### Error: "Package not found"

**Cause**: The `lock_package` app is not installed on the device.

**Solution**: Install the target app first:
```bash
adb install myapp.apk
```

### External app doesn't stay on top / disappears

**Cause**: FreeKiosk requires "Display over other apps" (SYSTEM_ALERT_WINDOW) permission to keep external apps locked.

**Solution**:

**Option 1: Set Device Owner (recommended for kiosks)**
```bash
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver
```
With Device Owner, FreeKiosk can automatically grant itself all required permissions including "appear on top" and "Usage Access".

**Option 2: Manual permission (without Device Owner)**
1. Go to Settings → Apps → FreeKiosk → Display over other apps
2. Enable the permission manually

### EXTERNAL_APP_LAUNCHED not appearing in logcat

**Cause**: Without Device Owner, the "Usage Access" (PACKAGE_USAGE_STATS) permission must be granted manually for FreeKiosk to verify that the external app is in the foreground.

**Solution**: Grant the permission via ADB:
```bash
adb shell appops set com.freekiosk android:get_usage_stats allow
```
Without this permission, the broadcast will still be emitted but with `(NOT verified)` instead of `(verified in foreground)`. The logcat tag is `FreeKiosk-ADB`:
```bash
adb logcat -s "FreeKiosk-ADB"
```

**Note**: Device Owner can only be set on a freshly reset device or during initial setup. Once set, all permissions are managed automatically.

### Nothing happens

**Cause**: ADB debugging might be disabled or device not authorized.

**Solution**:
1. Enable USB Debugging in Developer Options
2. Accept the "Allow USB debugging" prompt on device
3. Verify with `adb devices`

### How to reset and re-provision

```bash
# Option 1: Factory reset (loses all data)
adb shell am broadcast -a android.intent.action.MASTER_CLEAR

# Option 2: Remove Device Owner + clear FreeKiosk data
adb shell dpm remove-active-admin com.freekiosk/.DeviceAdminReceiver
adb shell pm clear com.freekiosk
```

---

## Security Considerations

1. **ADB Access = Full Control**: Anyone with ADB access to an unlocked device can potentially reconfigure it. Disable USB debugging in production.

2. **PIN Storage**: The ADB PIN is saved to Android Keystore via `react-native-keychain` with PBKDF2 hashing (same secure storage as the UI PIN). The native side also keeps a SHA-256 hash for ADB re-authentication.

3. **Network ADB**: If using `adb tcpip`, ensure proper network security as anyone on the network could potentially access ADB.

4. **Configuration Storage**: ADB configuration is first saved to SharedPreferences as a "pending config", then applied to AsyncStorage by React Native on the next startup. This two-step bridge ensures reliable persistence across process restarts (~500ms).

5. **Recommendations**:
   - Use strong PINs (6+ digits)
   - Disable USB debugging after setup in production
   - Use Device Owner mode for full kiosk lockdown
   - Consider physical security of USB port

---

## See Also

- [REST API Documentation](REST_API.md) - Remote control via HTTP
- [MDM Specification](MDM_SPEC.md) - Enterprise deployment
- [Installation Guide](INSTALL.md) - Manual setup instructions
