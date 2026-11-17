/**
 * #215: the option "Pause the page while the screen is off". Off by default, since a dashboard that
 * must keep updating, or a page with sound, is meant to keep running.
 */
export {};

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { StorageService } = require('../src/utils/storage');

const KEY = '@kiosk_pause_page_screen_off';

describe('pause the page while the screen is off', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('is off until it is switched on', async () => {
    expect(await StorageService.getPausePageWhenScreenOff()).toBe(false);
  });

  it('keeps what was saved, under the key the native side and ADB read', async () => {
    await StorageService.savePausePageWhenScreenOff(true);
    expect(await AsyncStorage.getItem(KEY)).toBe('true');
    expect(await StorageService.getPausePageWhenScreenOff()).toBe(true);

    await StorageService.savePausePageWhenScreenOff(false);
    expect(await AsyncStorage.getItem(KEY)).toBe('false');
    expect(await StorageService.getPausePageWhenScreenOff()).toBe(false);
  });

  it('treats anything but "true" as off', async () => {
    await AsyncStorage.setItem(KEY, 'yes');
    expect(await StorageService.getPausePageWhenScreenOff()).toBe(false);
  });
});
