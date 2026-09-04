# FreeKiosk Deployment Scripts

| Script | Platform | Purpose |
| --- | --- | --- |
| `deploy_mac.zsh` | macOS | Install the APK and set Device Owner in one guided run |
| `set-device-owner.ps1` | Windows | Diagnose *why* Device Owner provisioning fails, then set it |
| `install-boot-autostart.ps1` | Windows | Make FreeKiosk start at boot on ROMs that drop `BOOT_COMPLETED` |
| `device/` | — | Files the installer copies into `/system` on the device |

## `set-device-owner.ps1`

`adb shell dpm set-device-owner` reports every failure with the same opaque
`RuntimeException`. This script checks each precondition separately — app
installed, no existing owner, single user, no accounts, and the
`android.software.device_admin` system feature — and names the one that is
actually blocking.

```powershell
.\set-device-owner.ps1                      # diagnose + provision
.\set-device-owner.ps1 -Serial <serial>   # pick a device when several are attached
.\set-device-owner.ps1 -Remove              # remove Device Owner (testOnly builds only)
.\set-device-owner.ps1 -Fix                 # also patch a ROM that omits device_admin (reboots)
.\set-device-owner.ps1 -Yes                 # skip the confirmation prompt (unattended runs)
```

It confirms before provisioning: on a release APK, Device Owner can only be cleared by
a factory reset, so setting it on the wrong attached device is not recoverable.

`-Fix` covers cheap Android TV boxes (MXQ, X96, H96…) whose ROM strips the
`android.software.device_admin` feature, which disables `DevicePolicyManagerService`
outright. It declares the feature in `/system/etc/permissions` and reboots, and
needs a `userdebug`/`eng` build that grants `adb root`. See
[ADB Configuration → Troubleshooting](../docs/adb-configuration.md#error-cant-set-package--as-device-owner)
for the manual equivalent and the caveats.

## `install-boot-autostart.ps1`

For ROMs where FreeKiosk never comes up after a reboot even with Device Owner and both
"Launch on Boot" and "Set FreeKiosk as default launcher" enabled. Two independent ROM
behaviours cause this (see
[ADB Configuration → FreeKiosk does not start after a reboot](../docs/adb-configuration.md#freekiosk-does-not-start-after-a-reboot)):
`BOOT_COMPLETED` is never delivered to third-party receivers, and the Home intent is
resolved while user 0 is still locked, which excludes `MainActivity`.

```powershell
.\install-boot-autostart.ps1              # install, reboot, verify
.\install-boot-autostart.ps1 -NoReboot    # install only
.\install-boot-autostart.ps1 -Uninstall   # remove (reboot to take effect)
```

Needs a `userdebug`/`eng` ROM that grants `adb root`. Run `set-device-owner.ps1` first.

## `deploy_mac.zsh`

### Prerequisites

- **adb (Android Debug Bridge)** - Download from [Android Platform Tools](https://developer.android.com/studio/releases/platform-tools)
or install using 
```bash
brew install android-platform-tools
```
- A **factory-reset Android tablet** with:
  - USB Debugging enabled
  - No Google accounts or other accounts added
  - No lock screen password set

### Setup Instructions

#### 1. Prepare the APK

Place your FreeKiosk APK file in this `scripts/` directory. The APK should be named in the format:
```
freekiosk-v*.apk
```

For example: `freekiosk-v1.0.0.apk`

#### 2. Make the Script Executable

Before running the script for the first time, make it executable:

```bash
chmod +x deploy_mac.zsh
```

#### 3. Connect Your Tablet

1. Enable **Developer Options** on your Android tablet:
   - Go to Settings > About tablet
   - Tap "Build number" 7 times
   
2. Enable **USB Debugging**:
   - Go to Settings > Developer Options
   - Enable "USB debugging"

3. Connect the tablet to your Mac via USB cable

#### 4. Run the Script

```bash
./deploy_mac.zsh
```

The script will guide you through the following steps:
- Check for adb installation
- Locate the FreeKiosk APK
- Verify device connection
- Install the APK
- Set FreeKiosk as Device Owner
- Optionally reboot the device

## Troubleshooting

### "No devices found"
- Make sure USB debugging is enabled
- Check the USB cable connection
- Look for a popup on the tablet asking to authorize USB debugging

### "Device is unauthorized"
- Check your tablet screen for a USB debugging authorization popup
- Tap "Allow" and try again

### "Failed to set device owner"
Common causes:
- **Accounts exist**: Remove all Google accounts and other accounts from the tablet
- **Lock screen**: Remove any PIN, pattern, or password lock
- **Previous owner**: Factory reset the device to remove any existing device owner
- **ROM has no device admin support**: common on Android TV boxes — check with
  `adb shell pm list features | grep device_admin`, then see
  [`set-device-owner.ps1 -Fix`](#set-device-ownerps1)

Run `set-device-owner.ps1` to find out which of these it actually is.

### "adb not found"
- Install Android Platform Tools
- Add the platform-tools directory to your PATH
- Or use the full path to adb

## What Happens After Setup?

Once the script completes successfully:
- FreeKiosk will be set as the Device Owner
- The app will have special permissions to manage the device
- You can configure kiosk settings within the FreeKiosk app
- The tablet will be locked down according to your kiosk configuration

## Important Notes

⚠️ **Device Owner mode can only be set on a device with no accounts**. If you have trouble, factory reset the tablet and try again before adding any accounts.

⚠️ **Removing Device Owner** requires a factory reset of the device.

## Support

For issues or questions, refer to:

- [Documentation Hub](../docs/README.md)
- [Installation Guide](../docs/installation.md)
