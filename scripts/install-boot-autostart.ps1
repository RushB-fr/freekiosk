#Requires -Version 5.1
<#
.SYNOPSIS
    Installs a /system autostart hook for ROMs that never launch FreeKiosk at boot.

.DESCRIPTION
    Some Android TV boxes (observed on a Droidlogic/MXQ box, Android 9) break boot
    launch in two independent ways:

      1. ACTION_BOOT_COMPLETED is never delivered to third-party manifest receivers,
         so FreeKiosk's "Launch on Boot" never fires. The receiver itself is fine —
         hand-delivering the same broadcast starts the app correctly.
      2. The Home intent is resolved while user 0 is still locked, which filters out
         MainActivity (not directBootAware), so the OEM launcher wins Home and the
         Device Owner "default launcher" policy is never consulted. Android does not
         re-resolve Home after unlock.

    This installs /system/bin/freekiosk-autostart.sh plus an init .rc that runs it on
    sys.boot_completed=1. The script waits for user 0 to unlock, then starts
    MainActivity, retrying up to three times.

    Run scripts/set-device-owner.ps1 first — this covers boot launch only.

.PARAMETER Serial
    Target device serial. Optional when exactly one device is attached.

.PARAMETER Uninstall
    Remove both files instead of installing them (reboot to take effect).

.PARAMETER NoReboot
    Skip the verification reboot. Nothing takes effect until the device reboots.

.EXAMPLE
    .\install-boot-autostart.ps1
    Install, reboot, and report whether FreeKiosk actually came up.
#>
[CmdletBinding()]
param(
    [string] $Serial,
    [switch] $Uninstall,
    [switch] $NoReboot
)

$ErrorActionPreference = 'Stop'

$ScriptPath = '/system/bin/freekiosk-autostart.sh'
$RcPath     = '/system/etc/init/freekiosk-autostart.rc'
$LocalDir   = Join-Path $PSScriptRoot 'device'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [ok]   $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "    [fail] $msg" -ForegroundColor Red }

function Invoke-Adb {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Args)
    $full = @()
    if ($Serial) { $full += @('-s', $Serial) }
    $full += $Args
    (& adb @full 2>&1) -join "`n"
}
function Invoke-Shell([string] $cmd) { Invoke-Adb shell $cmd }

$deviceLines = @((& adb devices) |
    Select-Object -Skip 1 |
    Where-Object { $_ -match '^\S+\s+device$' })
if (-not $deviceLines) { throw "No device in 'device' state. Check 'adb devices'." }
if (-not $Serial) {
    if ($deviceLines.Count -gt 1) { throw "$($deviceLines.Count) devices attached — pass -Serial." }
    $Serial = ($deviceLines[0] -split '\s+')[0]
}

Write-Step "Gaining root"
$type = (Invoke-Shell 'getprop ro.build.type').Trim()
Invoke-Adb root | Out-Null
Start-Sleep -Seconds 2
Invoke-Adb wait-for-device | Out-Null
if ((Invoke-Shell 'id') -notmatch 'uid=0') {
    Write-Bad "adb root unavailable (build type '$type') — /system cannot be modified on this ROM"
    return
}
if ((Invoke-Adb remount) -notmatch 'succeed') {
    Write-Bad "adb remount failed"
    return
}
Write-Ok "/system mounted read-write"

if ($Uninstall) {
    Write-Step "Removing autostart hook"
    Invoke-Shell "rm -f $ScriptPath $RcPath" | Out-Null
    Write-Ok "removed — reboot to take effect"
    return
}

Write-Step "Installing"
foreach ($f in @('freekiosk-autostart.sh', 'freekiosk-autostart.rc')) {
    $src = Join-Path $LocalDir $f
    if (-not (Test-Path $src)) { throw "Missing $src" }
    Invoke-Adb push $src "/data/local/tmp/$f" | Out-Null
}
Invoke-Shell @"
cp /data/local/tmp/freekiosk-autostart.sh $ScriptPath && chmod 755 $ScriptPath &&
cp /data/local/tmp/freekiosk-autostart.rc $RcPath && chmod 644 $RcPath &&
restorecon $ScriptPath $RcPath 2>/dev/null;
rm -f /data/local/tmp/freekiosk-autostart.*
"@ | Out-Null

if ((Invoke-Shell "ls $ScriptPath $RcPath") -match 'No such file') {
    Write-Bad "install failed"
    return
}
Write-Ok "installed $ScriptPath and $RcPath"

if ($NoReboot) {
    Write-Host "`nReboot to activate." -ForegroundColor Yellow
    return
}

Write-Step "Rebooting to verify"
Invoke-Adb reboot | Out-Null
Start-Sleep -Seconds 5
Invoke-Adb wait-for-device | Out-Null
for ($i = 0; $i -lt 90; $i++) {
    if ((Invoke-Shell 'getprop sys.boot_completed').Trim() -eq '1') { break }
    Start-Sleep -Seconds 2
}
Write-Host "    booted — waiting 40s for the autostart hook"
Start-Sleep -Seconds 40

$log = Invoke-Shell 'logcat -d -s freekiosk-autostart'
$resumed = (Invoke-Shell 'dumpsys activity activities | grep mResumedActivity').Trim()
Write-Host "    $resumed"
if ($log -match 'foreground handed over: ok') {
    Write-Ok "autostart fired and FreeKiosk took over"
} elseif ($log -match 'gave up') {
    Write-Bad "autostart ran but could not displace the launcher"
} else {
    Write-Bad "autostart did not run — check 'adb logcat -d -s freekiosk-autostart'"
}
