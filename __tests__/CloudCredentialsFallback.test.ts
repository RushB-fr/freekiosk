/**
 * Cloud credentials on a device whose AndroidKeyStore is broken (Rockchip RK3568 signage
 * firmwares, where the keymaster HAL crashes on key generation).
 *
 *   - a Keychain that stores and reads back the payload is trusted, and any stale
 *     fallback is removed
 *   - a Keychain that throws, or reports success but reads back nothing, falls back to
 *     AsyncStorage, so the device still checks in after enrolling
 *   - reads try the Keychain first, then the fallback; malformed data reads as null
 *   - clearing removes both copies, even when the Keychain throws
 */
export {};

const Keychain = require('react-native-keychain');
const AsyncStorageModule = require('@react-native-async-storage/async-storage');
const AsyncStorage = AsyncStorageModule.default ?? AsyncStorageModule;
const {
  saveCloudCredentials,
  getCloudCredentials,
  clearCloudCredentials,
} = require('../src/utils/secureStorage');

const FALLBACK_KEY = '@kiosk_cloud_credentials_fallback';

const CREDS = {
  deviceId: 'dev-1',
  apiKey: 'fk_test',
  cloudUrl: 'https://cloud.test',
  organizationName: 'Test Org',
};
const PAYLOAD = JSON.stringify(CREDS);

const keystoreError = () => new Error('Keystore operation failed');

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Keychain.setGenericPassword.mockImplementation(() => Promise.resolve(true));
  Keychain.getGenericPassword.mockImplementation(() => Promise.resolve(false));
  Keychain.resetGenericPassword.mockImplementation(() => Promise.resolve(true));
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('saveCloudCredentials', () => {
  it('keeps the credentials in the Keychain and removes a stale fallback when the read-back matches', async () => {
    await AsyncStorage.setItem(FALLBACK_KEY, 'stale');
    Keychain.getGenericPassword.mockResolvedValueOnce({ username: 'cloud', password: PAYLOAD });

    await saveCloudCredentials(CREDS);

    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'cloud',
      PAYLOAD,
      expect.objectContaining({ service: 'freekiosk_cloud' }),
    );
    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBeNull();
  });

  it('falls back to AsyncStorage when the Keychain write throws', async () => {
    Keychain.setGenericPassword.mockRejectedValueOnce(keystoreError());

    await saveCloudCredentials(CREDS);

    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBe(PAYLOAD);
    expect(console.warn).toHaveBeenCalled();
  });

  it('falls back to AsyncStorage when the Keychain reports success but reads back nothing', async () => {
    Keychain.getGenericPassword.mockResolvedValueOnce(false);

    await saveCloudCredentials(CREDS);

    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBe(PAYLOAD);
  });

  it('falls back to AsyncStorage when the Keychain reads back a different value', async () => {
    Keychain.getGenericPassword.mockResolvedValueOnce({ username: 'cloud', password: 'other' });

    await saveCloudCredentials(CREDS);

    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBe(PAYLOAD);
  });

  it('logs and does not throw when the fallback write fails too', async () => {
    Keychain.setGenericPassword.mockRejectedValueOnce(keystoreError());
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(saveCloudCredentials(CREDS)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('getCloudCredentials', () => {
  it('returns the Keychain credentials when present', async () => {
    Keychain.getGenericPassword.mockResolvedValueOnce({ username: 'cloud', password: PAYLOAD });

    expect(await getCloudCredentials()).toEqual(CREDS);
  });

  it('returns the fallback when the Keychain is empty', async () => {
    await AsyncStorage.setItem(FALLBACK_KEY, PAYLOAD);

    expect(await getCloudCredentials()).toEqual(CREDS);
  });

  it('returns the fallback when the Keychain read throws', async () => {
    Keychain.getGenericPassword.mockRejectedValueOnce(keystoreError());
    await AsyncStorage.setItem(FALLBACK_KEY, PAYLOAD);

    expect(await getCloudCredentials()).toEqual(CREDS);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null when neither store has credentials', async () => {
    expect(await getCloudCredentials()).toBeNull();
  });

  it('returns null for stored data missing the device id or API key', async () => {
    Keychain.getGenericPassword.mockResolvedValueOnce({
      username: 'cloud',
      password: JSON.stringify({ deviceId: 'dev-1' }),
    });

    expect(await getCloudCredentials()).toBeNull();
  });

  it('returns null and logs when the fallback is not valid JSON', async () => {
    await AsyncStorage.setItem(FALLBACK_KEY, '{not json');

    expect(await getCloudCredentials()).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('survives an enroll on a broken keystore: save then read returns the credentials', async () => {
    Keychain.setGenericPassword.mockRejectedValue(keystoreError());
    Keychain.getGenericPassword.mockRejectedValue(keystoreError());

    await saveCloudCredentials(CREDS);

    expect(await getCloudCredentials()).toEqual(CREDS);
  });
});

describe('clearCloudCredentials', () => {
  it('removes both the Keychain entry and the fallback', async () => {
    await AsyncStorage.setItem(FALLBACK_KEY, PAYLOAD);

    await clearCloudCredentials();

    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'freekiosk_cloud' });
    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBeNull();
  });

  it('still removes the fallback when the Keychain reset throws', async () => {
    Keychain.resetGenericPassword.mockRejectedValueOnce(keystoreError());
    await AsyncStorage.setItem(FALLBACK_KEY, PAYLOAD);

    await clearCloudCredentials();

    expect(await AsyncStorage.getItem(FALLBACK_KEY)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('logs and does not throw when removing the fallback fails', async () => {
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk error'));

    await expect(clearCloudCredentials()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
