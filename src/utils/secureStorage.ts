import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { StorageService } from './storage';

const { KioskModule } = NativeModules;

// Constants
const PIN_SERVICE = 'freekiosk_pin';
const API_KEY_SERVICE = 'freekiosk_api_key';
const MQTT_PASSWORD_SERVICE = 'freekiosk_mqtt_password';
const LEGACY_API_KEY = '@kiosk_rest_api_key'; // Legacy AsyncStorage key for migration
const ATTEMPTS_KEY = '@kiosk_pin_attempts';
const LOCKOUT_KEY = '@kiosk_pin_lockout';
const DEFAULT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const ATTEMPTS_RESET_DURATION = 60 * 60 * 1000; // 1 hour - Reset attempts after 1 hour of no activity

// Crypto constants
const PBKDF2_ITERATIONS = 100000; // 100k iterations (secure)
const SALT_LENGTH = 32; // 32 bytes = 256 bits

interface PinAttempts {
  count: number;
  lastAttempt: number;
  lockoutUntil: number | null;
}

/**
 * NOUVELLE IMPLÉMENTATION SÉCURISÉE
 * Utilise PBKDF2 avec 100 000 itérations
 */
async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  try {
    // Check if Web Crypto API is available
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      // Convert PIN to bytes
      const encoder = new TextEncoder();
      const pinBytes = encoder.encode(pin);

      // Import key material
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        pinBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      // Derive bits using PBKDF2
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: PBKDF2_ITERATIONS,
          hash: 'SHA-256'
        },
        keyMaterial,
        256 // 256 bits output
      );

      // Convert to hex string
      const hashArray = Array.from(new Uint8Array(derivedBits));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      return hashHex;
    } else {
      // Fallback: Use react-native-keychain's internal crypto
      console.warn('[SecureStorage] Web Crypto API not available, using fallback');
      return await fallbackHashPin(pin, salt);
    }
  } catch (error) {
    console.error('[SecureStorage] Error in hashPin:', error);
    // Use fallback on error
    return await fallbackHashPin(pin, salt);
  }
}

/**
 * Fallback implementation using simple but stronger hashing
 * Still better than the original but not as good as PBKDF2
 */
async function fallbackHashPin(pin: string, salt: Uint8Array): Promise<string> {
  console.warn('[SecureStorage] Using fallback hash (not PBKDF2)');

  // Convert salt to string
  const saltStr = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  // Use multiple rounds of SHA-like hashing
  let hash = pin + saltStr;

  // More iterations than before (10000 instead of 1000)
  for (let i = 0; i < 10000; i++) {
    let h = 0;
    for (let j = 0; j < hash.length; j++) {
      const char = hash.charCodeAt(j);
      h = ((h << 5) - h) + char;
      h = h & h;
    }
    // Add iteration counter and mix better
    hash = h.toString(36) + i.toString(36) + hash.substring(0, 20);
  }

  return hash;
}

/**
 * NOUVELLE IMPLÉMENTATION SÉCURISÉE
 * Generate a cryptographically secure random salt
 */
function generateSalt(): Uint8Array {
  const array = new Uint8Array(SALT_LENGTH);

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Use secure random (Web Crypto API)
    crypto.getRandomValues(array);
  } else {
    // Fallback: Use Math.random() but warn
    console.warn('[SecureStorage] crypto.getRandomValues not available, using Math.random (INSECURE)');
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }

  return array;
}

/**
 * Convert Uint8Array to hex string for storage
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Securely save PIN with PBKDF2 hashing
 */
export async function saveSecurePin(pin: string): Promise<boolean> {
  try {
    const salt = generateSalt();
    const hashedPin = await hashPin(pin, salt);

    // Store hashed PIN + salt in Android Keystore via react-native-keychain
    await Keychain.setGenericPassword(
      'pin',
      JSON.stringify({
        hash: hashedPin,
        salt: bytesToHex(salt)
      }),
      {
        service: PIN_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
      }
    );

    // Also save hash for ADB verification (keeps native and RN in sync)
    if (Platform.OS === 'android' && KioskModule?.saveAdbPinHash) {
      try {
        await KioskModule.saveAdbPinHash(pin);
        console.log('[SecureStorage] ADB PIN hash synced');
      } catch (e) {
        console.warn('[SecureStorage] Failed to sync ADB PIN hash:', e);
        // Non-fatal: ADB config just won't work, but app PIN still works
      }
    }

    // Reset attempts when new PIN is set
    await resetPinAttempts();

    return true;
  } catch (error) {
    console.error('[SecureStorage] Error saving PIN:', error);
    return false;
  }
}

/**
 * Verify PIN against stored hash
 * Supports migration from legacy plaintext PIN (v1.0.0-1.0.3) to PBKDF2
 */
export async function verifySecurePin(inputPin: string): Promise<{
  success: boolean;
  attemptsRemaining?: number;
  lockoutTimeRemaining?: number;
  message?: string;
}> {
  try {
    // Check if locked out
    const lockoutStatus = await checkLockout();
    if (lockoutStatus.isLockedOut) {
      return {
        success: false,
        lockoutTimeRemaining: lockoutStatus.timeRemaining ?? undefined,
        message: `Too many failed attempts. Try again in ${Math.ceil((lockoutStatus.timeRemaining || 0) / 60000)} minutes.`,
      };
    }

    // Get stored PIN data from Keystore
    const credentials = await Keychain.getGenericPassword({ service: PIN_SERVICE });

    if (!credentials) {
      // No PIN in Keystore - Check for legacy plaintext PIN in AsyncStorage (v0)
      const legacyPlaintextPin = await checkLegacyPlaintextPin();

      if (legacyPlaintextPin) {
        // Found plaintext PIN from v1.0.0-1.0.3
        if (inputPin === legacyPlaintextPin) {
          // Success - migrate to v2
          await saveSecurePin(inputPin); // Save with PBKDF2
          await clearLegacyPlaintextPin(); // Remove plaintext
          await resetPinAttempts();
          return {
            success: true,
            message: 'PIN upgraded from plaintext to secure PBKDF2'
          };
        } else {
          // Failed plaintext verification
          await recordFailedAttempt();
          const maxAttempts = await getMaxAttempts();
          const attempts = await getPinAttempts();

          if (attempts.count >= maxAttempts) {
            return {
              success: false,
              lockoutTimeRemaining: LOCKOUT_DURATION,
              message: `Too many failed attempts. Locked for 15 minutes.`,
            };
          }

          return {
            success: false,
            attemptsRemaining: maxAttempts - attempts.count,
            message: 'Incorrect PIN',
          };
        }
      }

      // No PIN at all - use default '1234' (backward compatibility)
      if (inputPin === '1234') {
        await resetPinAttempts();
        return { success: true };
      } else {
        await recordFailedAttempt();
        const maxAttempts = await getMaxAttempts();
        const attempts = await getPinAttempts();
        return {
          success: false,
          attemptsRemaining: maxAttempts - attempts.count,
          message: 'Incorrect PIN',
        };
      }
    }

    // Has PIN in Keystore - Verify with PBKDF2 (v2)
    const pinData = JSON.parse(credentials.password);
    const { hash: storedHash, salt: saltHex } = pinData;
    const salt = hexToBytes(saltHex);
    const inputHash = await hashPin(inputPin, salt);

    if (inputHash === storedHash) {
      // Success - reset attempts
      await resetPinAttempts();
      return { success: true };
    } else {
      // Failed - record attempt
      await recordFailedAttempt();
      const maxAttempts = await getMaxAttempts();
      const attempts = await getPinAttempts();

      if (attempts.count >= maxAttempts) {
        return {
          success: false,
          lockoutTimeRemaining: LOCKOUT_DURATION,
          message: `Too many failed attempts. Locked for 15 minutes.`,
        };
      }

      return {
        success: false,
        attemptsRemaining: maxAttempts - attempts.count,
        message: 'Incorrect PIN',
      };
    }
  } catch (error) {
    console.error('[SecureStorage] Error verifying PIN:', error);
    return {
      success: false,
      message: 'Error verifying PIN',
    };
  }
}

/**
 * Get current PIN attempts data
 */
async function getPinAttempts(): Promise<PinAttempts> {
  try {
    const data = await AsyncStorage.getItem(ATTEMPTS_KEY);
    if (data) {
      const attempts: PinAttempts = JSON.parse(data);
      const now = Date.now();
      
      // Reset attempts if more than 1 hour has passed since last attempt
      if (attempts.lastAttempt > 0 && (now - attempts.lastAttempt) > ATTEMPTS_RESET_DURATION) {
        // Reset and persist to storage
        const resetAttempts: PinAttempts = {
          count: 0,
          lastAttempt: 0,
          lockoutUntil: null,
        };
        await AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(resetAttempts));
        return resetAttempts;
      }
      
      return attempts;
    }
  } catch (error) {
    console.error('[SecureStorage] Error reading attempts:', error);
  }

  return {
    count: 0,
    lastAttempt: 0,
    lockoutUntil: null,
  };
}

/**
 * Get max attempts from settings
 */
async function getMaxAttempts(): Promise<number> {
  try {
    const maxAttempts = await StorageService.getPinMaxAttempts();
    return Math.max(1, Math.min(100, maxAttempts)); // Clamp between 1 and 100
  } catch (error) {
    console.error('[SecureStorage] Error getting max attempts:', error);
    return DEFAULT_MAX_ATTEMPTS;
  }
}

/**
 * Record a failed PIN attempt
 */
async function recordFailedAttempt(): Promise<void> {
  try {
    const maxAttempts = await getMaxAttempts();
    const attempts = await getPinAttempts();
    const now = Date.now();

    attempts.count += 1;
    attempts.lastAttempt = now;

    // If max attempts reached, set lockout
    if (attempts.count >= maxAttempts) {
      attempts.lockoutUntil = now + LOCKOUT_DURATION;
      console.warn(`[SecureStorage] Max attempts (${maxAttempts}) reached - locking for 15 minutes`);
    }

    await AsyncStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch (error) {
    console.error('[SecureStorage] Error recording attempt:', error);
  }
}

/**
 * Reset PIN attempts counter
 */
async function resetPinAttempts(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([ATTEMPTS_KEY, LOCKOUT_KEY]);
  } catch (error) {
    console.error('[SecureStorage] Error resetting attempts:', error);
  }
}

/**
 * Check if currently locked out
 */
async function checkLockout(): Promise<{
  isLockedOut: boolean;
  timeRemaining: number | null;
}> {
  try {
    const attempts = await getPinAttempts();

    if (!attempts.lockoutUntil) {
      return { isLockedOut: false, timeRemaining: null };
    }

    const now = Date.now();
    const timeRemaining = attempts.lockoutUntil - now;

    if (timeRemaining > 0) {
      return { isLockedOut: true, timeRemaining };
    } else {
      // Lockout expired - reset
      await resetPinAttempts();
      return { isLockedOut: false, timeRemaining: null };
    }
  } catch (error) {
    console.error('[SecureStorage] Error checking lockout:', error);
    return { isLockedOut: false, timeRemaining: null };
  }
}

/**
 * Get lockout status for UI display
 */
export async function getLockoutStatus(): Promise<{
  isLockedOut: boolean;
  timeRemaining: number | null;
  attemptsRemaining: number;
}> {
  const maxAttempts = await getMaxAttempts();
  const lockout = await checkLockout();
  const attempts = await getPinAttempts();

  return {
    isLockedOut: lockout.isLockedOut,
    timeRemaining: lockout.timeRemaining,
    attemptsRemaining: Math.max(0, maxAttempts - attempts.count),
  };
}

/**
 * Check if PIN exists (for migration from old system)
 * Returns true if there's a PIN in Keychain OR a legacy PIN in AsyncStorage
 */
export async function hasSecurePin(): Promise<boolean> {
  try {
    // Check Keychain first
    const credentials = await Keychain.getGenericPassword({ service: PIN_SERVICE });
    if (credentials) {
      return true;
    }
    
    // Check for legacy plaintext PIN in AsyncStorage
    const legacyPin = await checkLegacyPlaintextPin();
    return !!legacyPin;
  } catch (error) {
    return false;
  }
}

/**
 * Migrate old plaintext PIN to secure storage
 */
export async function migrateOldPin(oldPin: string | null): Promise<void> {
  try {
    if (oldPin && oldPin !== '1234') {
      await saveSecurePin(oldPin);
    }
  } catch (error) {
    console.error('[SecureStorage] Error migrating PIN:', error);
  }
}

/**
 * Clear all PIN data (for reset)
 */
export async function clearSecurePin(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: PIN_SERVICE });
    await resetPinAttempts();
    await clearLegacyPlaintextPin(); // Also clear any plaintext PIN
    
    // Also clear ADB PIN hash
    if (Platform.OS === 'android' && KioskModule?.clearAdbPinHash) {
      try {
        await KioskModule.clearAdbPinHash();
        console.log('[SecureStorage] ADB PIN hash cleared');
      } catch (e) {
        console.warn('[SecureStorage] Failed to clear ADB PIN hash:', e);
      }
    }
  } catch (error) {
    console.error('[SecureStorage] Error clearing PIN:', error);
  }
}

/**
 * Check for legacy plaintext PIN in AsyncStorage (v1.0.0-1.0.3)
 */
async function checkLegacyPlaintextPin(): Promise<string | null> {
  try {
    // Check old storage key used in v1.0.0-1.0.3
    const plaintextPin = await AsyncStorage.getItem('@kiosk_pin');
    if (plaintextPin && plaintextPin !== '' && plaintextPin !== '1234') {
      return plaintextPin;
    }
    return null;
  } catch (error) {
    console.error('[SecureStorage] Error checking legacy PIN:', error);
    return null;
  }
}

/**
 * Clear legacy plaintext PIN from AsyncStorage
 */
async function clearLegacyPlaintextPin(): Promise<void> {
  try {
    await AsyncStorage.removeItem('@kiosk_pin');
  } catch (error) {
    console.error('[SecureStorage] Error clearing legacy PIN:', error);
  }
}

// ============================================
// REST API KEY SECURE STORAGE
// ============================================

/**
 * Save REST API key securely in Keychain
 * Migrates from AsyncStorage if exists (backward compatibility)
 */
export async function saveSecureApiKey(apiKey: string): Promise<boolean> {
  try {
    if (!apiKey || apiKey.trim() === '') {
      // Empty key - remove from both storages
      await clearSecureApiKey();
      return true;
    }

    // Store in Keychain
    await Keychain.setGenericPassword(
      'api_key',
      apiKey,
      {
        service: API_KEY_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
      }
    );

    // Clear legacy storage if exists (migration cleanup)
    await clearLegacyApiKey();

    console.log('[SecureStorage] API key saved to Keychain');
    return true;
  } catch (error) {
    console.error('[SecureStorage] Error saving API key:', error);
    return false;
  }
}

/**
 * Get REST API key from secure storage
 * Supports migration from legacy AsyncStorage (backward compatibility)
 */
export async function getSecureApiKey(): Promise<string> {
  try {
    // First, try to get from Keychain
    const credentials = await Keychain.getGenericPassword({ service: API_KEY_SERVICE });

    if (credentials && credentials.password) {
      return credentials.password;
    }

    // If not in Keychain, check legacy AsyncStorage (migration)
    const legacyKey = await checkLegacyApiKey();
    if (legacyKey) {
      console.log('[SecureStorage] Migrating API key from AsyncStorage to Keychain');
      // Migrate to Keychain
      await saveSecureApiKey(legacyKey);
      // Return the migrated key
      return legacyKey;
    }

    // No key found anywhere
    return '';
  } catch (error) {
    console.error('[SecureStorage] Error getting API key:', error);
    return '';
  }
}

/**
 * Clear REST API key from secure storage
 */
export async function clearSecureApiKey(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: API_KEY_SERVICE });
    await clearLegacyApiKey();
    console.log('[SecureStorage] API key cleared');
  } catch (error) {
    console.error('[SecureStorage] Error clearing API key:', error);
  }
}

/**
 * Check for legacy API key in AsyncStorage
 */
async function checkLegacyApiKey(): Promise<string | null> {
  try {
    const legacyKey = await AsyncStorage.getItem(LEGACY_API_KEY);
    if (legacyKey && legacyKey !== '') {
      return legacyKey;
    }
    return null;
  } catch (error) {
    console.error('[SecureStorage] Error checking legacy API key:', error);
    return null;
  }
}

/**
 * Clear legacy API key from AsyncStorage
 */
async function clearLegacyApiKey(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_API_KEY);
  } catch (error) {
    console.error('[SecureStorage] Error clearing legacy API key:', error);
  }
}

// ============================================
// MQTT PASSWORD SECURE STORAGE
// ============================================

/**
 * Save MQTT password securely in Keychain
 */
export async function saveSecureMqttPassword(password: string): Promise<boolean> {
  try {
    if (!password || password.trim() === '') {
      await clearSecureMqttPassword();
      return true;
    }

    await Keychain.setGenericPassword(
      'mqtt_password',
      password,
      {
        service: MQTT_PASSWORD_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
      }
    );

    console.log('[SecureStorage] MQTT password saved to Keychain');
    return true;
  } catch (error) {
    console.error('[SecureStorage] Error saving MQTT password:', error);
    return false;
  }
}

/**
 * Get MQTT password from secure storage
 */
export async function getSecureMqttPassword(): Promise<string> {
  try {
    const credentials = await Keychain.getGenericPassword({ service: MQTT_PASSWORD_SERVICE });

    if (credentials && credentials.password) {
      return credentials.password;
    }

    return '';
  } catch (error) {
    console.error('[SecureStorage] Error getting MQTT password:', error);
    return '';
  }
}

/**
 * Clear MQTT password from secure storage
 */
export async function clearSecureMqttPassword(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: MQTT_PASSWORD_SERVICE });
    console.log('[SecureStorage] MQTT password cleared');
  } catch (error) {
    console.error('[SecureStorage] Error clearing MQTT password:', error);
  }
}
