/**
 * Setup wizard: the guided first launch (src/screens/SetupWizardScreen.tsx).
 *
 * This file holds what can be decided without a screen: whether the tablet is a fresh install
 * (the wizard is shown only then), and the checks on what the user types.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { hasSecurePin } from './secureStorage';
import { CloudSyncService } from './CloudSyncService';
import { CLOUD_ENABLED } from '../config/features';

/** Set once the wizard has been completed or left for the advanced settings. */
export const SETUP_DONE_KEY = '@kiosk_setup_wizard_done';

/**
 * Keys that say nothing about the configuration: the wizard flag itself, and the language (the
 * app can be switched to another language before anything else is set).
 */
const NEUTRAL_KEYS = new Set<string>([SETUP_DONE_KEY, '@kiosk_language']);

export interface FreshInstallFacts {
  /** Every AsyncStorage key of the app. */
  storedKeys: string[];
  /** The wizard has already run (or was skipped). */
  setupDone: boolean;
  /** A PIN of its own is stored (secure storage). */
  hasPin: boolean;
  /** The tablet is enrolled in FreeKiosk Cloud. */
  enrolled: boolean;
  /** A QR provisioning left a cloud enrolment token waiting. */
  pendingEnrollment: boolean;
}

/**
 * A tablet is "fresh" when nothing at all has been set: no key of the configuration, no PIN, no
 * cloud enrolment, no provisioning in progress. A configuration written over ADB, by the cloud
 * or by a previous version counts as a setup, so an update never shows the wizard to a tablet
 * that already runs a kiosk.
 */
export function decideFreshInstall(facts: FreshInstallFacts): boolean {
  if (facts.setupDone) return false;
  if (facts.hasPin || facts.enrolled || facts.pendingEnrollment) return false;
  return !hasConfigurationKey(facts.storedKeys);
}

/** Whether any stored key is a setting (anything of the app configuration but the neutral keys). */
export function hasConfigurationKey(storedKeys: string[]): boolean {
  return storedKeys.some((key) => key.startsWith('@kiosk_') && !NEUTRAL_KEYS.has(key));
}

/** Reads the facts and decides. Any failure means "not fresh": the kiosk must never be held back. */
export async function isFreshInstall(): Promise<boolean> {
  try {
    const storedKeys = [...(await AsyncStorage.getAllKeys())];
    // The usual case, an app that is already set up, answers here without touching anything else.
    if (storedKeys.includes(SETUP_DONE_KEY) || hasConfigurationKey(storedKeys)) return false;
    const hasPin = await hasSecurePin();
    const enrolled = CLOUD_ENABLED ? await CloudSyncService.isEnrolled() : false;
    let pendingEnrollment = false;
    try {
      const pending = await NativeModules.KioskModule?.getPendingCloudEnrollment?.();
      pendingEnrollment = !!(pending && pending.enroll_token);
    } catch {
      pendingEnrollment = false;
    }
    return decideFreshInstall({ storedKeys, setupDone: false, hasPin, enrolled, pendingEnrollment });
  } catch (error) {
    console.warn('[SetupWizard] Could not read the install state, skipping the wizard:', error);
    return false;
  }
}

export async function markSetupDone(): Promise<void> {
  await AsyncStorage.setItem(SETUP_DONE_KEY, 'true');
}

export type UrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'blocked' };

const BLOCKED_SCHEME = /^(javascript|data|vbscript|blob):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HTTP_URL = /^https?:\/\/([^\s/:?#@]+)(:\d{1,5})?([/?#]\S*)?$/i;

/**
 * What the user typed, as the address to display. A bare "example.com" becomes https://example.com.
 * Only http and https are accepted here (a local file or another scheme is for the advanced settings),
 * and a one-word host such as "nas" needs the scheme typed, so a typo is not taken for an address.
 */
export function normalizeWizardUrl(input: string): UrlCheck {
  const raw = (input ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  if (BLOCKED_SCHEME.test(raw)) return { ok: false, reason: 'blocked' };
  let candidate = raw;
  if (!HAS_SCHEME.test(raw)) {
    if (/\s/.test(raw)) return { ok: false, reason: 'invalid' };
    const bareHost = raw.split(/[/:?#]/)[0].toLowerCase();
    if (!bareHost.includes('.') && bareHost !== 'localhost') return { ok: false, reason: 'invalid' };
    candidate = `https://${raw}`;
  }
  const match = HTTP_URL.exec(candidate);
  if (!match) return { ok: false, reason: 'invalid' };
  const port = match[2] ? parseInt(match[2].slice(1), 10) : 0;
  if (match[2] && (port < 1 || port > 65535)) return { ok: false, reason: 'invalid' };
  return { ok: true, url: candidate };
}

export const WIZARD_PIN_MIN = 4;
export const WIZARD_PIN_MAX = 6;

/** The numeric PIN the settings accept: 4 to 6 digits. */
export function isValidWizardPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= WIZARD_PIN_MIN && pin.length <= WIZARD_PIN_MAX;
}

/** The practice zone of the last screen: same rule as the real gesture (N taps close together, within the timeout). */
export interface TapState {
  count: number;
  firstAt: number;
  x: number;
  y: number;
}

/** Distance, in dp, within which the taps count as "the same spot". */
export const TAP_RADIUS_DP = 80;

/** The state after one more tap: a tap that is too late or too far starts a new sequence. */
export function nextTapState(
  prev: TapState | null,
  now: number,
  x: number,
  y: number,
  timeoutMs: number,
  radius: number = TAP_RADIUS_DP,
): TapState {
  if (!prev || now - prev.firstAt > timeoutMs || Math.hypot(x - prev.x, y - prev.y) > radius) {
    return { count: 1, firstAt: now, x, y };
  }
  return { ...prev, count: prev.count + 1 };
}
