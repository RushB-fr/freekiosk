/**
 * The default PIN 1234 only opens the settings when no PIN was ever set.
 *
 * A Keystore that throws on read (#258, #200) used to look exactly like "no PIN set", so a
 * device with a PIN of its own fell back to 1234 the moment its Keystore misbehaved.
 */
export {};

const Keychain = require('react-native-keychain');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { saveSecurePin, verifySecurePin, clearSecurePin } = require('../src/utils/secureStorage');

let stored: { password: string } | false = false;
let keychainBroken = false;

beforeEach(async () => {
  await AsyncStorage.clear();
  stored = false;
  keychainBroken = false;
  Keychain.setGenericPassword.mockImplementation((_u: string, password: string) => {
    stored = { password };
    return Promise.resolve(true);
  });
  Keychain.getGenericPassword.mockImplementation(() =>
    keychainBroken ? Promise.reject(new Error('Keystore unavailable')) : Promise.resolve(stored),
  );
  Keychain.resetGenericPassword.mockImplementation(() => {
    stored = false;
    return Promise.resolve(true);
  });
});

test('no PIN ever set: 1234 opens the settings, even with a failing Keystore', async () => {
  keychainBroken = true;
  expect((await verifySecurePin('1234')).success).toBe(true);
});

test('a PIN was set: a failing Keystore does not bring back 1234', async () => {
  await saveSecurePin('9876');
  keychainBroken = true;
  const result = await verifySecurePin('1234');
  expect(result.success).toBe(false);
  expect(result.attemptsRemaining).toBeUndefined();
});

test('a PIN set before the flag existed gets it on the next correct entry', async () => {
  await saveSecurePin('9876');
  await AsyncStorage.removeItem('@kiosk_pin_set'); // as an install from before this change
  expect((await verifySecurePin('9876')).success).toBe(true);
  keychainBroken = true;
  expect((await verifySecurePin('1234')).success).toBe(false);
});

test('clearing the PIN restores the default', async () => {
  await saveSecurePin('9876');
  await clearSecurePin();
  keychainBroken = true;
  expect((await verifySecurePin('1234')).success).toBe(true);
});
