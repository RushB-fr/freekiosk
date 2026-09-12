#!/system/bin/sh
# FreeKiosk autostart, for ROMs that never bring FreeKiosk up at boot.
#
# Two independent ROM behaviours break boot launch on some Android TV boxes
# (observed on a Droidlogic/MXQ box, Android 9 / SDK 28):
#
#   1. ACTION_BOOT_COMPLETED is never delivered to third-party manifest receivers,
#      so FreeKiosk's own BootReceiver ("Launch on Boot") never fires. The same
#      receiver works when the identical broadcast is delivered by hand, so the
#      app-side logic is fine.
#   2. The Home intent is resolved while user 0 is still locked. MainActivity is
#      not directBootAware, so it is filtered out of that query and the OEM
#      launcher wins — the Device Owner "default launcher" policy is correct but
#      never gets consulted. Android does not re-resolve Home after unlock.
#
# This script covers both by starting the activity once the user is unlocked.
#
# Install to /system/bin/freekiosk-autostart.sh (0755), paired with
# /system/etc/init/freekiosk-autostart.rc. Remove both and reboot to undo.
# Requires a userdebug/eng ROM (adb root). See scripts/install-boot-autostart.ps1.

PKG=com.freekiosk
ACT=$PKG/.MainActivity

# Wait for user 0 to be unlocked. Before that MainActivity cannot be resolved and
# am silently does nothing.
i=0
while [ "$(getprop sys.user.0.ce_available)" != "true" ] && [ $i -lt 60 ]; do
    sleep 1
    i=$((i + 1))
done

# Let the package manager and the OEM launcher settle.
sleep 8

# Whatever holds the foreground now is the launcher we have to displace. Detecting
# it keeps this script ROM-independent instead of hardcoding a package name.
HOME_PKG=$(dumpsys activity activities | grep mResumedActivity | sed -n 's/.* u0 \([^/]*\)\/.*/\1/p')
log -t freekiosk-autostart "current foreground: ${HOME_PKG:-none}"

# Retry: the first start can land before the OEM launcher has taken the foreground,
# which would then cover FreeKiosk again. Success is "the launcher is no longer on
# top" rather than "FreeKiosk is on top", because in External App mode FreeKiosk
# immediately hands the foreground to the app it locks.
n=0
while [ $n -lt 3 ]; do
    log -t freekiosk-autostart "starting $ACT (attempt $((n + 1)))"
    am start -n "$ACT" >/dev/null 2>&1
    sleep 6
    if [ -z "$HOME_PKG" ] || ! dumpsys activity activities | grep mResumedActivity | grep -q "$HOME_PKG"; then
        log -t freekiosk-autostart "foreground handed over: ok"
        exit 0
    fi
    n=$((n + 1))
done

log -t freekiosk-autostart "gave up after 3 attempts"
