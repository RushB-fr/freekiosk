#!/bin/zsh

# FreeKiosk Device Owner Setup Script
# This script helps set up Device Owner mode for FreeKiosk app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo "${GREEN}✅ ${NC}$1"
}

print_warning() {
    echo "${YELLOW}⚠️  ${NC}$1"
}

print_error() {
    echo "${RED}❌ ${NC}$1"
}

print_step() {
    echo "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "${BLUE}$1${NC}"
    echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Function to wait for user confirmation
wait_for_user() {
    echo -n "${YELLOW}Press Enter to continue...${NC}"
    read
}

# Get script directory
SCRIPT_DIR="${0:a:h}"

# Clear screen and show header
clear
echo "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo "${GREEN}║   FreeKiosk Device Owner Setup Assistant     ║${NC}"
echo "${GREEN}╚═══════════════════════════════════════════════╝${NC}\n"

# Step 0: Check for adb
print_step "Step 0: Checking Prerequisites"
if ! command -v adb &> /dev/null; then
    print_error "adb (Android Debug Bridge) is not installed or not in PATH"
    print_info "Please install Android Platform Tools first"
    print_info "Download from: https://developer.android.com/studio/releases/platform-tools"
    exit 1
fi
print_success "adb found: $(which adb)"
wait_for_user

# Step 1: Find APK
print_step "Step 1: Locating FreeKiosk APK"
APK_FILE=$(find "$SCRIPT_DIR" -maxdepth 1 -name "freekiosk-v*.apk" | head -n 1)

if [[ -z "$APK_FILE" ]]; then
    print_error "No FreeKiosk APK found in the same directory as this script"
    print_info "Looking for: freekiosk-v*.apk"
    print_info "Script directory: $SCRIPT_DIR"
    exit 1
fi

print_success "Found APK: $(basename "$APK_FILE")"
wait_for_user

# Step 2: Connect Device
print_step "Step 2: Connect Tablet to PC"
print_info "Please ensure:"
print_info "  1. USB Debugging is enabled on your tablet"
print_info "  2. Tablet is connected via USB cable"
print_info "  3. Tablet is NOT factory reset yet (should be done before this)"
wait_for_user

# Step 3: Verify Connection
print_step "Step 3: Verify Connection"
print_info "Checking for connected devices..."
echo ""

ADB_OUTPUT=$(adb devices)
echo "$ADB_OUTPUT"
echo ""

# Check if any devices are connected
DEVICE_COUNT=$(echo "$ADB_OUTPUT" | grep -c "device$" || true)

if [[ $DEVICE_COUNT -eq 0 ]]; then
    print_error "No devices found or device is unauthorized"
    print_warning "If you see 'unauthorized', check your tablet screen for a popup"
    print_info "Grant USB debugging permission and try again"
    exit 1
fi

print_success "Device connected!"

# Check for unauthorized devices
if echo "$ADB_OUTPUT" | grep -q "unauthorized"; then
    print_warning "Device is unauthorized - check tablet screen for USB debugging popup"
    exit 1
fi

wait_for_user

# Step 4: Install APK
print_step "Step 4: Installing FreeKiosk APK"
print_info "Installing: $(basename "$APK_FILE")"
echo ""

if adb install "$APK_FILE"; then
    print_success "APK installed successfully!"
else
    # Try install with -r flag to replace existing
    print_warning "Initial install failed, trying to replace existing app..."
    if adb install -r "$APK_FILE"; then
        print_success "APK installed successfully (replaced existing)!"
    else
        print_error "Failed to install APK"
        exit 1
    fi
fi

wait_for_user

# Step 5: Set Device Owner
print_step "Step 5: Set Device Owner"
print_warning "IMPORTANT: This step requires NO other accounts on the device"
print_info "Make sure all Google accounts and other accounts are removed"
echo ""
print_info "Setting Device Owner..."
echo ""

DPM_OUTPUT=$(adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver 2>&1)
echo "$DPM_OUTPUT"
echo ""

if echo "$DPM_OUTPUT" | grep -q "Success"; then
    print_success "Device owner set successfully!"
    print_success "Your tablet is now in Device Owner mode!"
else
    print_error "Failed to set device owner"
    print_info "Common issues:"
    print_info "  - Device has Google account or other accounts (remove them first)"
    print_info "  - Device has lock screen password (remove it first)"
    print_info "  - Device already has a device owner"
    exit 1
fi

wait_for_user

# Step 6: Reboot (optional)
print_step "Step 6: Reboot Device (Optional)"
echo -n "${YELLOW}Do you want to reboot the tablet now? (y/n): ${NC}"
read REBOOT_CHOICE

if [[ "$REBOOT_CHOICE" =~ ^[Yy]$ ]]; then
    print_info "Rebooting device..."
    adb reboot
    print_success "Device is rebooting!"
else
    print_info "Skipping reboot - you can manually reboot later if needed"
fi

# Final message
echo ""
echo "${GREEN}╔═══════════════════════════════════════════════╗${NC}"
echo "${GREEN}║          Setup Complete Successfully!         ║${NC}"
echo "${GREEN}╚═══════════════════════════════════════════════╝${NC}"
echo ""
print_success "FreeKiosk is now configured as Device Owner"
print_info "You can now configure kiosk settings in the FreeKiosk app"
echo ""
