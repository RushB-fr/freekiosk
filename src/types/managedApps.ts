/**
 * FreeKiosk - Managed Apps Types
 * 
 * Unified data model for features:
 * - #66: Accessibility whitelist for other apps
 * - #67: Multi-app mode (multiple apps on home screen)
 * - #37: Background apps (launch on boot, keep alive)
 */

export interface ManagedApp {
  /** Android package name, e.g. "com.example.app" */
  packageName: string;

  /** Human-readable display name (cached from PackageManager) */
  displayName: string;

  /**
   * MicroAppStation micro-app id. When set, this entry is one URL "app" hosted by
   * `packageName` (local.microstation) and opens directly into that micro-app.
   * Several entries can share the host package, so use getManagedAppKey() for identity.
   */
  microAppId?: string;

  // --- #67: Multi-App Mode ---
  /** Show this app on the kiosk home screen grid */
  showOnHomeScreen: boolean;

  /** Optional home-screen group. null/undefined keeps the app in the root Apps row. */
  groupId?: string | null;

  /** Explicit position inside its group (or the root Apps row). */
  displayOrder?: number;

  // --- #37: Background Apps ---
  /** Launch this app in the background on device boot */
  launchOnBoot: boolean;
  /** Monitor and restart this app if it closes/crashes */
  keepAlive: boolean;

  // --- #66: Accessibility Whitelist ---
  /** Allow this app's accessibility services (DevicePolicyManager.setPermittedAccessibilityServices) */
  allowAccessibility: boolean;
}

/**
 * Create a new ManagedApp with sensible defaults.
 * By default, the app is shown on the home screen.
 */
export function createManagedApp(
  packageName: string,
  displayName: string,
  overrides?: Partial<ManagedApp>,
): ManagedApp {
  return {
    packageName,
    displayName,
    showOnHomeScreen: true,
    groupId: null,
    displayOrder: 0,
    launchOnBoot: false,
    keepAlive: false,
    allowAccessibility: false,
    ...overrides,
  };
}

/** Stable identity of a managed entry; micro-apps share their host package name. */
export function getManagedAppKey(app: Pick<ManagedApp, 'packageName' | 'microAppId'>): string {
  return app.microAppId ? `${app.packageName}#${app.microAppId}` : app.packageName;
}

export function isMicroApp(app: Pick<ManagedApp, 'microAppId'>): boolean {
  return Boolean(app.microAppId);
}

/**
 * Create a home-screen entry for a MicroAppStation micro-app. Boot launch, keep-alive and
 * accessibility apply to whole packages, so they stay off: they would open the host's
 * editor rather than this micro-app.
 */
export function createMicroApp(
  packageName: string,
  microAppId: string,
  displayName: string,
  overrides?: Partial<ManagedApp>,
): ManagedApp {
  return {
    ...createManagedApp(packageName, displayName, overrides),
    microAppId,
    launchOnBoot: false,
    keepAlive: false,
    allowAccessibility: false,
  };
}

/**
 * Validate a package name format
 */
export function isValidPackageName(pkg: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(pkg);
}
