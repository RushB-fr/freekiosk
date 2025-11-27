# FreeKiosk Deployment Script for Mac

This directory contains a deployment script to help set up FreeKiosk as a Device Owner on Android tablets.

## Prerequisites

- **adb (Android Debug Bridge)** - Download from [Android Platform Tools](https://developer.android.com/studio/releases/platform-tools)
or install using 
```bash
brew install android-platform-tools
```
- A **factory-reset Android tablet** with:
  - USB Debugging enabled
  - No Google accounts or other accounts added
  - No lock screen password set

## Setup Instructions

### 1. Prepare the APK

Place your FreeKiosk APK file in this `scripts/` directory. The APK should be named in the format:
```
freekiosk-v*.apk
```

For example: `freekiosk-v1.0.0.apk`

### 2. Make the Script Executable

Before running the script for the first time, make it executable:

```bash
chmod +x deploy_mac.zsh
```

### 3. Connect Your Tablet

1. Enable **Developer Options** on your Android tablet:
   - Go to Settings > About tablet
   - Tap "Build number" 7 times
   
2. Enable **USB Debugging**:
   - Go to Settings > Developer Options
   - Enable "USB debugging"

3. Connect the tablet to your Mac via USB cable

### 4. Run the Script

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

For issues or questions, please refer to the main [FreeKiosk documentation](../README.md).
