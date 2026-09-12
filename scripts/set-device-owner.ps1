#Requires -Version 5.1
<#
.SYNOPSIS
    Sets FreeKiosk as Device Owner over ADB, diagnosing the usual failure causes first.

.DESCRIPTION
    `adb shell dpm set-device-owner` reports every failure with the same opaque
    message:

        java.lang.RuntimeException: Can't set package ComponentInfo{...} as device owner.

    This script checks each precondition separately and names the one that is
    actually blocking, instead of leaving you to guess.

    One of those preconditions is the `android.software.device_admin` system
    feature. Many cheap Android TV boxes ship a ROM that omits it; without it
    DevicePolicyManagerService runs with mHasFeature = false, so setDeviceOwner()
    returns false and setActiveAdmin() becomes a silent no-op (`dpm
    set-active-admin` still prints "Success" — it does not check the result).
    With -Fix, and on a device that grants `adb root`, the script declares the
    feature in /system/etc/permissions and reboots.

.PARAMETER Serial
    Target device serial (as shown by `adb devices`). Optional when exactly one
    device is attached.

.PARAMETER Component
    Device admin component. Defaults to FreeKiosk's.

.PARAMETER Fix
    Allow the script to patch /system when the device_admin feature is missing.
    Requires a userdebug/eng ROM that grants `adb root`, and REBOOTS the device.

.PARAMETER Yes
    Skip the confirmation prompt before provisioning. Setting Device Owner is
    effectively irreversible on a release APK (factory reset only), so the script
    asks first unless this is passed. Use it in unattended provisioning runs.

.PARAMETER Remove
    Remove the device owner instead of setting it. This only succeeds when the
    installed APK was built with android:testOnly="true"; DevicePolicyManager
    refuses to force-remove a non-test admin over adb. For a release APK, a
    factory reset is the only way to clear the device owner.

.EXAMPLE
    .\set-device-owner.ps1
    Diagnose and set device owner on the single attached device.

.EXAMPLE
    .\set-device-owner.ps1 -Serial <serial> -Fix
    Same, but patch /system and reboot if the device_admin feature is missing.
#>
[CmdletBinding()]
param(
    [string] $Serial,
    [string] $Component = 'com.freekiosk/.DeviceAdminReceiver',
    [switch] $Fix,
    [switch] $Remove,
    [switch] $Yes
)

$ErrorActionPreference = 'Stop'

$FeatureName = 'android.software.device_admin'
$FeaturePath = "/system/etc/permissions/$FeatureName.xml"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [ok]   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    [warn] $msg" -ForegroundColor Yellow }
function Write-Bad($msg)  { Write-Host "    [fail] $msg" -ForegroundColor Red }

# Run an adb command against the target device and return its combined output.
function Invoke-Adb {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Args)
    $full = @()
    if ($Serial) { $full += @('-s', $Serial) }
    $full += $Args
    (& adb @full 2>&1) -join "`n"
}

function Invoke-Shell([string] $cmd) { Invoke-Adb shell $cmd }

# ---------------------------------------------------------------- device pick

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw "adb not found on PATH. Install Android platform-tools first."
}

$deviceLines = @((& adb devices) |
    Select-Object -Skip 1 |
    Where-Object { $_ -match '^\S+\s+device$' })

if (-not $deviceLines) { throw "No device in 'device' state. Check 'adb devices'." }

if (-not $Serial) {
    if ($deviceLines.Count -gt 1) {
        throw "$($deviceLines.Count) devices attached — pass -Serial to pick one."
    }
    $Serial = ($deviceLines[0] -split '\s+')[0]
}

$package = ($Component -split '/')[0]

Write-Step "Device"
$sdk     = (Invoke-Shell 'getprop ro.build.version.sdk').Trim()
$release = (Invoke-Shell 'getprop ro.build.version.release').Trim()
$model   = (Invoke-Shell 'getprop ro.product.model').Trim()
$type    = (Invoke-Shell 'getprop ro.build.type').Trim()
Write-Host "    serial=$Serial model=$model android=$release sdk=$sdk build=$type"

# ------------------------------------------------------------------- removal

if ($Remove) {
    Write-Step "Removing device owner"
    $out = Invoke-Shell "dpm remove-active-admin $Component"
    if ($out -match 'Success') {
        Write-Ok $out.Trim()
    } else {
        Write-Bad $out.Trim()
        if ($out -match 'non-test admin|SecurityException') {
            Write-Warn "the installed APK is not android:testOnly=`"true`", so the device owner"
            Write-Warn "cannot be removed over adb — a factory reset is the only way to clear it"
        }
    }
    return
}

# ------------------------------------------------------------------ preflight

$blockers = @()

Write-Step "Preflight"

# 1. App installed?
if ((Invoke-Shell "pm list packages $package") -match [regex]::Escape("package:$package")) {
    Write-Ok "$package is installed"
} else {
    Write-Bad "$package is NOT installed — install the APK first"
    $blockers += 'package-missing'
}

# 2. Device owner / profile owner already set? A device owner can only be
#    replaced after removing the existing one (or a factory reset).
$policy = Invoke-Shell 'dumpsys device_policy'
if ($policy -match 'Device Owner:') {
    Write-Bad "a device owner is already set — factory reset to change it (-Remove works only on testOnly builds)"
    ($policy -split "`n" | Select-String 'admin=' | Select-Object -First 1) |
        ForEach-Object { Write-Host "           $($_.ToString().Trim())" }
    $blockers += 'has-device-owner'
} else {
    Write-Ok "no existing device owner"
}
if ($policy -match 'Profile Owner:') {
    Write-Bad "a profile owner is set on this user — remove it first"
    $blockers += 'has-profile-owner'
}

# 3. Exactly one user? The adb path refuses to provision when secondary users
#    exist on a non-split-system-user device.
$users = @((Invoke-Shell 'pm list users') -split "`n" | Select-String 'UserInfo\{')
if ($users.Count -le 1) {
    Write-Ok "single user on device"
} else {
    Write-Bad "$($users.Count) users exist — remove secondary users (pm remove-user <id>)"
    $users | ForEach-Object { Write-Host "           $($_.ToString().Trim())" }
    $blockers += 'multi-user'
}

# 4. No accounts? Any added account blocks adb provisioning (CODE_ACCOUNTS_NOT_EMPTY).
$accounts = Invoke-Shell 'dumpsys account'
if ($accounts -match 'Accounts:\s*(\d+)') {
    $n = [int]$Matches[1]
    if ($n -eq 0) {
        Write-Ok "no accounts on device"
    } else {
        Write-Bad "$n account(s) present — remove every account under Settings > Accounts"
        $blockers += 'accounts'
    }
} else {
    Write-Warn "could not read account count from dumpsys — remove all accounts if provisioning fails"
}

# 5. device_admin system feature present? Absent on many Android TV ROMs.
$hasFeature = (Invoke-Shell 'pm list features') -match [regex]::Escape($FeatureName)
if ($hasFeature) {
    Write-Ok "$FeatureName is declared"
} else {
    Write-Bad "$FeatureName is MISSING — DevicePolicyManagerService is disabled on this ROM"
    $blockers += 'no-feature'
}

# ----------------------------------------------------------- /system feature fix

if ($blockers -contains 'no-feature') {
    if (-not $Fix) {
        Write-Host ""
        Write-Host "This ROM does not declare $FeatureName, so device owner can never be set as-is." -ForegroundColor Yellow
        Write-Host "Re-run with -Fix to declare it in $FeaturePath and reboot." -ForegroundColor Yellow
        Write-Host "That needs a userdebug/eng build that grants 'adb root' (this one is '$type')." -ForegroundColor Yellow
        return
    }

    Write-Step "Patching /system to declare $FeatureName"

    $rootOut = Invoke-Adb root
    Start-Sleep -Seconds 2
    Invoke-Adb wait-for-device | Out-Null
    if ((Invoke-Shell 'id') -notmatch 'uid=0') {
        Write-Bad "adb root unavailable ($($rootOut.Trim())) — this ROM is locked down; the box cannot be provisioned without reflashing"
        return
    }
    Write-Ok "running adbd as root"

    $remount = Invoke-Adb remount
    if ($remount -notmatch 'succeed') {
        Write-Bad "adb remount failed: $($remount.Trim())"
        return
    }
    Write-Ok "/system mounted read-write"

    # Push via /data/local/tmp: writing the XML through `adb shell` redirection
    # mangles the quotes on Windows.
    $local = Join-Path ([IO.Path]::GetTempPath()) "$FeatureName.xml"
    @"
<permissions>
    <feature name="$FeatureName" />
</permissions>
"@ | Set-Content -Path $local -Encoding ASCII -NoNewline

    Invoke-Adb push $local "/data/local/tmp/$FeatureName.xml" | Out-Null
    Invoke-Shell "cp /data/local/tmp/$FeatureName.xml $FeaturePath && chmod 644 $FeaturePath && chown root:root $FeaturePath && restorecon $FeaturePath 2>/dev/null; rm /data/local/tmp/$FeatureName.xml" | Out-Null
    Remove-Item $local -ErrorAction SilentlyContinue

    $written = Invoke-Shell "cat $FeaturePath"
    if ($written -notmatch [regex]::Escape($FeatureName)) {
        Write-Bad "failed to write $FeaturePath"
        return
    }
    Write-Ok "wrote $FeaturePath"

    Write-Step "Rebooting (the feature list is parsed only at boot)"
    Invoke-Adb reboot | Out-Null
    Start-Sleep -Seconds 5
    Invoke-Adb wait-for-device | Out-Null
    for ($i = 0; $i -lt 60; $i++) {
        if ((Invoke-Shell 'getprop sys.boot_completed').Trim() -eq '1') { break }
        Start-Sleep -Seconds 2
    }
    Start-Sleep -Seconds 3

    if ((Invoke-Shell 'pm list features') -match [regex]::Escape($FeatureName)) {
        Write-Ok "$FeatureName now declared"
        $blockers = $blockers | Where-Object { $_ -ne 'no-feature' }
    } else {
        Write-Bad "$FeatureName still missing after reboot"
        return
    }
}

if ($blockers) {
    Write-Host "`nBlocked by: $($blockers -join ', ')" -ForegroundColor Red
    return
}

# ------------------------------------------------------------------ provision

# Provisioning the wrong device is the one mistake this script cannot undo: on a
# release APK the device owner can only be cleared by a factory reset. Confirm the
# target first unless the caller opted out.
if (-not $Yes) {
    Write-Host ""
    Write-Host "About to set Device Owner on $Serial ($model)." -ForegroundColor Yellow
    Write-Host "On a release APK this can only be undone by a FACTORY RESET." -ForegroundColor Yellow
    $answer = Read-Host "Continue? [y/N]"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "Aborted."
        return
    }
}

Write-Step "Setting device owner"
$out = Invoke-Shell "dpm set-device-owner $Component"
Write-Host "    $($out.Trim() -replace "`n", "`n    ")"

Write-Step "Verifying"
$policy = Invoke-Shell 'dumpsys device_policy'
if ($policy -match 'Device Owner:') {
    Write-Ok "device owner is set"
    ($policy -split "`n" | Select-String 'admin=' | Select-Object -First 1) |
        ForEach-Object { Write-Host "           $($_.ToString().Trim())" }
} else {
    Write-Bad "device owner is NOT set"
    exit 1
}
