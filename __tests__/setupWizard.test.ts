/**
 * The setup wizard (guided first launch): when a tablet counts as a fresh install, and what the
 * address and PIN fields accept.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getAllKeys: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('../src/utils/secureStorage', () => ({ hasSecurePin: jest.fn() }));
jest.mock('../src/utils/CloudSyncService', () => ({ CloudSyncService: { isEnrolled: jest.fn() } }));
jest.mock('../src/config/features', () => ({ CLOUD_ENABLED: true }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { hasSecurePin } from '../src/utils/secureStorage';
import { CloudSyncService } from '../src/utils/CloudSyncService';
import {
  SETUP_DONE_KEY,
  decideFreshInstall,
  isFreshInstall,
  isValidWizardPin,
  markSetupDone,
  nextTapState,
  normalizeWizardUrl,
} from '../src/utils/setupWizard';

const facts = (over: Partial<Parameters<typeof decideFreshInstall>[0]> = {}) => ({
  storedKeys: [],
  setupDone: false,
  hasPin: false,
  enrolled: false,
  pendingEnrollment: false,
  ...over,
});

describe('decideFreshInstall', () => {
  it('is fresh when nothing is stored', () => {
    expect(decideFreshInstall(facts())).toBe(true);
  });

  it('ignores the language and keys that are not the app configuration', () => {
    expect(decideFreshInstall(facts({ storedKeys: ['@kiosk_language', 'something_else'] }))).toBe(true);
  });

  it('is not fresh once any setting exists (ADB, cloud, a previous version)', () => {
    expect(decideFreshInstall(facts({ storedKeys: ['@kiosk_url'] }))).toBe(false);
    expect(decideFreshInstall(facts({ storedKeys: ['@kiosk_display_mode'] }))).toBe(false);
    expect(decideFreshInstall(facts({ storedKeys: ['@kiosk_language', '@kiosk_auto_launch'] }))).toBe(false);
  });

  it('is not fresh with a PIN, a cloud enrolment or a QR enrolment waiting', () => {
    expect(decideFreshInstall(facts({ hasPin: true }))).toBe(false);
    expect(decideFreshInstall(facts({ enrolled: true }))).toBe(false);
    expect(decideFreshInstall(facts({ pendingEnrollment: true }))).toBe(false);
  });

  it('is not fresh once the wizard has run', () => {
    expect(decideFreshInstall(facts({ setupDone: true }))).toBe(false);
  });
});

describe('isFreshInstall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
    (hasSecurePin as jest.Mock).mockResolvedValue(false);
    (CloudSyncService.isEnrolled as jest.Mock).mockResolvedValue(false);
    (NativeModules as any).KioskModule = { getPendingCloudEnrollment: jest.fn().mockResolvedValue(null) };
  });

  it('is true on an empty tablet', async () => {
    await expect(isFreshInstall()).resolves.toBe(true);
  });

  it('is false when the wizard flag is stored', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([SETUP_DONE_KEY]);
    await expect(isFreshInstall()).resolves.toBe(false);
  });

  it('is false when a QR provisioning left an enrolment token', async () => {
    (NativeModules as any).KioskModule.getPendingCloudEnrollment.mockResolvedValue({
      enroll_token: 'abc',
      cloud_url: 'https://cloud.example',
    });
    await expect(isFreshInstall()).resolves.toBe(false);
  });

  it('is true when the native side cannot answer about a pending enrolment', async () => {
    (NativeModules as any).KioskModule.getPendingCloudEnrollment.mockRejectedValue(new Error('boom'));
    await expect(isFreshInstall()).resolves.toBe(true);
  });

  it('is false, never blocking the kiosk, when the storage cannot be read', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(new Error('disk'));
    await expect(isFreshInstall()).resolves.toBe(false);
  });

  it('markSetupDone stores the flag', async () => {
    await markSetupDone();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(SETUP_DONE_KEY, 'true');
  });
});

describe('normalizeWizardUrl', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['  https://example.com/page?x=1  ', 'https://example.com/page?x=1'],
    ['http://192.168.1.20:8123', 'http://192.168.1.20:8123'],
    ['homeassistant.local:8123/lovelace', 'https://homeassistant.local:8123/lovelace'],
    ['http://nas:8080/app', 'http://nas:8080/app'],
    ['localhost:3000', 'https://localhost:3000'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeWizardUrl(input)).toEqual({ ok: true, url: expected });
  });

  it('refuses an empty field', () => {
    expect(normalizeWizardUrl('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'JavaScript:void(0)', 'blob:https://x/1'])('blocks %s', (input) => {
    expect(normalizeWizardUrl(input)).toEqual({ ok: false, reason: 'blocked' });
  });

  it.each([
    'nas', // one word, no scheme: more likely a typo than an address
    'two words.com',
    'ftp://example.com',
    'file:///sdcard/a.html',
    'https://',
    'http://exa mple.com',
    'https://example.com:99999',
    'https://example.com:0',
  ])('refuses %s', (input) => {
    expect(normalizeWizardUrl(input)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('isValidWizardPin', () => {
  it.each(['1234', '123456', '0000'])('accepts %s', (pin) => expect(isValidWizardPin(pin)).toBe(true));
  it.each(['', '123', '1234567', '12a4', '12 34', '１２３４'])('refuses "%s"', (pin) => expect(isValidWizardPin(pin)).toBe(false));
});

describe('nextTapState (the practice zone)', () => {
  it('counts taps close together within the timeout', () => {
    let s = nextTapState(null, 1000, 100, 100, 1500);
    s = nextTapState(s, 1300, 110, 95, 1500);
    s = nextTapState(s, 1600, 90, 105, 1500);
    expect(s.count).toBe(3);
    expect(s.firstAt).toBe(1000);
  });

  it('starts again when a tap comes after the timeout counted from the first tap', () => {
    let s = nextTapState(null, 1000, 100, 100, 1500);
    s = nextTapState(s, 2400, 100, 100, 1500); // 1400 ms after the first: still in
    expect(s.count).toBe(2);
    s = nextTapState(s, 2600, 100, 100, 1500); // 1600 ms after the first: new sequence
    expect(s).toMatchObject({ count: 1, firstAt: 2600 });
  });

  it('starts again when a tap is too far from the first', () => {
    let s = nextTapState(null, 1000, 100, 100, 1500);
    s = nextTapState(s, 1100, 400, 100, 1500);
    expect(s).toMatchObject({ count: 1, x: 400 });
  });
});
