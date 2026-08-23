/**
 * FreeKiosk - device capability reporting
 *
 * Computes the list of capabilities this device actually supports, so the cloud
 * dashboard can show only the actions that can really run (see the cloud's
 * `device-feature-audit.md` for the authoritative feature/DO matrix, and
 * `command_sender_script.html` `capabilityMap` for the commands gated on them).
 *
 * The list is sent at enrollment (device_info.capabilities) and refreshed on
 * every heartbeat (app.capabilities), so granting a permission later updates the
 * dashboard on the next tick. An empty list is treated by the cloud as a legacy
 * device (show everything), so we always report at least the baseline set.
 */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

import KioskModule from './KioskModule';
import AccessibilityModule from './AccessibilityModule';
import OverlayPermissionModule from './OverlayPermissionModule';

// Capability vocabulary. Keep in sync with the cloud (device-feature-audit.md).
export type Capability =
  // Baseline: available on any FreeKiosk install, no special access
  | 'brightness'
  | 'volume'
  | 'screen'
  | 'reload'
  | 'screenshot'
  | 'audio'
  | 'tts'
  | 'toast'
  | 'url'
  // Device Owner gated
  | 'device_owner'
  | 'reboot'
  | 'silent_install'
  | 'screen_off_lock'
  // Special-access / runtime permission gated
  | 'accessibility'
  | 'overlay'
  | 'usage_access'
  | 'camera'
  | 'location'
  | 'bluetooth';

const BASELINE: Capability[] = [
  'brightness',
  'volume',
  'screen',
  'reload',
  'screenshot',
  'audio',
  'tts',
  'toast',
  'url',
];

async function safe<T>(p: Promise<T> | undefined, fallback: T): Promise<T> {
  try {
    return p ? await p : fallback;
  } catch {
    return fallback;
  }
}

async function hasRuntimePermission(perm: string): Promise<boolean> {
  try {
    return await PermissionsAndroid.check(perm as any);
  } catch {
    return false;
  }
}

/**
 * Build the capability list from the device's real state. Best-effort: any
 * individual probe that throws is simply treated as "not supported".
 */
export async function getCapabilities(): Promise<string[]> {
  if (Platform.OS !== 'android') {
    return [...BASELINE];
  }

  const caps = new Set<Capability>(BASELINE);

  const isDeviceOwner = await safe(KioskModule?.isDeviceOwner(), false);
  if (isDeviceOwner) {
    // Reboot, silent APK install and a true screen-off lock all require the
    // Device Policy Manager, i.e. Device Owner (see audit).
    caps.add('device_owner');
    caps.add('reboot');
    caps.add('silent_install');
    caps.add('screen_off_lock');
  }

  // Accessibility can be enabled programmatically when Device Owner, otherwise
  // it depends on the user having toggled the service on.
  const accessibilityEnabled = await safe(
    AccessibilityModule?.isAccessibilityServiceEnabled(),
    false,
  );
  if (isDeviceOwner || accessibilityEnabled) {
    caps.add('accessibility');
  }

  if (await safe(OverlayPermissionModule?.canDrawOverlays(), false)) {
    caps.add('overlay');
  }
  if (await safe(KioskModule?.hasUsageStatsPermission(), false)) {
    caps.add('usage_access');
  }

  const P = PermissionsAndroid.PERMISSIONS;
  if (await hasRuntimePermission(P.CAMERA)) {
    caps.add('camera');
  }
  if (await hasRuntimePermission(P.ACCESS_FINE_LOCATION)) {
    caps.add('location');
  }
  if (P.BLUETOOTH_CONNECT && (await hasRuntimePermission(P.BLUETOOTH_CONNECT))) {
    caps.add('bluetooth');
  }

  return Array.from(caps);
}

// Small guard so callers can avoid pulling native modules on non-android.
export const isSupportedPlatform = Platform.OS === 'android' && !!NativeModules.KioskModule;
