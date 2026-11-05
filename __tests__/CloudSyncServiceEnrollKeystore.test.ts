/**
 * #321: enrollment when the Keystore cannot hold the cloud credentials.
 *
 *   - a refused or unreadable write fails the enrollment with a message, instead of a
 *     success that leaves the device offline for good
 *   - the cloud is told with the key held in memory, so it revokes it and does not keep
 *     a ghost device counting toward the limit
 *   - the local settings and secrets are left as they were: the wipe only follows a save
 *     that held
 *   - the credentials never go anywhere but the Keystore
 */
// A module of its own: other test files declare helpers of the same name.
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const mockClearSecurePin = jest.fn(() => Promise.resolve());

jest.mock('../src/utils/secureStorage', () => ({
  ...jest.requireActual('../src/utils/secureStorage'),
  clearSecurePin: () => mockClearSecurePin(),
  clearSecureApiKey: jest.fn(() => Promise.resolve()),
  clearSecureMqttPassword: jest.fn(() => Promise.resolve()),
  clearSecureBasicAuthPassword: jest.fn(() => Promise.resolve()),
}));

const Keychain = require('react-native-keychain');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { CloudSyncService } = require('../src/utils/CloudSyncService');

const ENROLL_URL = 'https://cloud.test/api/v1/devices/enroll/';
const UNENROLL_URL = 'https://cloud.test/api/v1/devices/dev-1/unenroll/';

/** Plays the cloud: the enroll call succeeds, everything else answers 200. */
function installFetch() {
  const calls: { url: string; init: any }[] = [];
  (globalThis as any).fetch = jest.fn((url: string, init: any) => {
    calls.push({ url, init });
    if (url === ENROLL_URL) {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          device_id: 'dev-1',
          api_key: 'fk_secret',
          organization_name: 'Test Org',
        }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
  return calls;
}

async function runEnroll() {
  const done = CloudSyncService.enroll('https://cloud.test/', 'tok', { model: 'RK3568' });
  await jest.runAllTimersAsync();
  return done;
}

describe('CloudSyncService.enroll when the Keystore fails (#321)', () => {
  let multiRemove: jest.SpyInstance;
  let setItem: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    Keychain.setGenericPassword.mockReset();
    Keychain.getGenericPassword.mockReset();
    mockClearSecurePin.mockClear();
    multiRemove = jest.spyOn(AsyncStorage, 'multiRemove');
    setItem = jest.spyOn(AsyncStorage, 'setItem');
    // start() would begin the heartbeat loop: not what these tests are about.
    jest.spyOn(CloudSyncService, 'start').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('fails with a message, tells the cloud and keeps the local settings when the write throws', async () => {
    Keychain.setGenericPassword.mockRejectedValue(new Error('KeyStoreException'));
    const calls = installFetch();

    const result = await runEnroll();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Keystore/);
    const unenroll = calls.find(c => c.url === UNENROLL_URL);
    expect(unenroll).toBeDefined();
    expect(unenroll!.init.method).toBe('POST');
    expect(unenroll!.init.headers.Authorization).toBe('Bearer fk_secret');
    expect(multiRemove).not.toHaveBeenCalled();
    expect(mockClearSecurePin).not.toHaveBeenCalled();
  });

  it('fails the same way when the write is accepted but nothing reads back', async () => {
    Keychain.setGenericPassword.mockResolvedValue(true);
    Keychain.getGenericPassword.mockResolvedValue(false);
    const calls = installFetch();

    const result = await runEnroll();

    expect(result.success).toBe(false);
    expect(calls.some(c => c.url === UNENROLL_URL)).toBe(true);
    expect(multiRemove).not.toHaveBeenCalled();
  });

  it('never writes the API key outside the Keystore', async () => {
    Keychain.setGenericPassword.mockRejectedValue(new Error('KeyStoreException'));
    installFetch();

    await runEnroll();

    const written = setItem.mock.calls.map(call => String(call[1]));
    expect(written.some(v => v.includes('fk_secret'))).toBe(false);
  });

  it('still enrolls, wiping the local settings, when the credentials read back', async () => {
    let stored: string | null = null;
    Keychain.setGenericPassword.mockImplementation((_u: string, value: string) => {
      stored = value;
      return Promise.resolve(true);
    });
    Keychain.getGenericPassword.mockImplementation(() =>
      Promise.resolve(stored ? { username: 'cloud', password: stored } : false));
    const calls = installFetch();

    const result = await runEnroll();

    expect(result).toEqual({ success: true, organizationName: 'Test Org' });
    expect(JSON.parse(stored!)).toEqual({
      deviceId: 'dev-1',
      apiKey: 'fk_secret',
      cloudUrl: 'https://cloud.test',
      organizationName: 'Test Org',
    });
    expect(calls.some(c => c.url === UNENROLL_URL)).toBe(false);
    expect(multiRemove).toHaveBeenCalled();
    expect(mockClearSecurePin).toHaveBeenCalled();
  });
});
