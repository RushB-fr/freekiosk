/** An installed Android application selected for suspension during Lock Mode. */
export interface BlockedApp {
  packageName: string;
  displayName: string;
}

const PACKAGE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Normalize persisted/imported values so malformed, duplicate, or self-blocking
 * entries never reach the Device Owner policy.
 */
export function normalizeBlockedApps(value: unknown): BlockedApp[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: BlockedApp[] = [];

  value.forEach(entry => {
    const packageName = typeof entry === 'string'
      ? entry.trim()
      : typeof entry === 'object' && entry !== null && typeof (entry as any).packageName === 'string'
        ? (entry as any).packageName.trim()
        : '';

    if (!PACKAGE_NAME_PATTERN.test(packageName) || packageName === 'com.freekiosk' || seen.has(packageName)) {
      return;
    }

    const rawDisplayName = typeof entry === 'object' && entry !== null
      ? (entry as any).displayName
      : undefined;
    const displayName = typeof rawDisplayName === 'string' && rawDisplayName.trim()
      ? rawDisplayName.trim()
      : packageName;

    seen.add(packageName);
    result.push({ packageName, displayName });
  });

  return result;
}
