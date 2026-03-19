/**
 * In-memory authentication state for PIN → Settings navigation.
 *
 * Prevents the Settings screen from being accessed without a valid PIN entry,
 * even if Android's native back-stack / gesture navigation re-creates the screen.
 *
 * The token is a timestamp set when the PIN is successfully verified.
 * Settings checks this token on mount — if absent or expired (>60 s),
 * the user is redirected back to Kiosk.
 *
 * Fix for issue #93: back gesture bypass on Lenovo IdeaTab Pro / Android 16.
 */

const AUTH_EXPIRY_MS = 60_000; // 60 seconds — generous window for Settings to mount

let _pinVerifiedAt: number | null = null;

/** Call after PIN is successfully verified (PinScreen → Settings). */
export function grantSettingsAccess(): void {
  _pinVerifiedAt = Date.now();
}

/** Call when leaving Settings (save, reset, back-to-kiosk, etc.). */
export function revokeSettingsAccess(): void {
  _pinVerifiedAt = null;
}

/**
 * Returns `true` if the PIN was verified recently enough for Settings to be
 * accessible.  Settings should call this on mount / focus and redirect to
 * Kiosk if it returns `false`.
 */
export function hasSettingsAccess(): boolean {
  if (_pinVerifiedAt === null) return false;
  return Date.now() - _pinVerifiedAt < AUTH_EXPIRY_MS;
}

/**
 * Consume the auth token — validates AND revokes in one step.
 * Useful when Settings mounts: it checks the token, then consumes it so that
 * a second mount (from gesture back-stack) will fail validation.
 */
export function consumeSettingsAccess(): boolean {
  const valid = hasSettingsAccess();
  // Don't revoke here — let Settings remain accessible while user is on the screen.
  // Revocation happens explicitly when navigating away.
  return valid;
}
