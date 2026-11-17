/**
 * "Pause the page while the screen is off" (#215) travels in the config the tablet syncs with
 * FreeKiosk Cloud: out through exportConfig(), in through importConfig(). A config that does not
 * carry it (an older cloud) must leave the device's own choice alone.
 */
// A module of its own: other test files declare helpers of their own, and without this
// they would collide in TypeScript's shared script scope.
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { StorageService } = require('../src/utils/storage');

const store = AsyncStorage.default ?? AsyncStorage;

describe('pausePageWhenScreenOff in the synced config', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('exports it as off by default', async () => {
    const config: any = await StorageService.exportConfig();
    expect(config.general.pausePageWhenScreenOff).toBe(false);
  });

  it('imports it, and exports it back unchanged', async () => {
    await StorageService.importConfig({ general: { pausePageWhenScreenOff: true } });

    expect(await StorageService.getPausePageWhenScreenOff()).toBe(true);
    expect(await store.getItem('@kiosk_pause_page_screen_off')).toBe('true');

    const config: any = await StorageService.exportConfig();
    expect(config.general.pausePageWhenScreenOff).toBe(true);
  });

  it('switches it back off when the cloud says so', async () => {
    await StorageService.savePausePageWhenScreenOff(true);

    await StorageService.importConfig({ general: { pausePageWhenScreenOff: false } });

    expect(await StorageService.getPausePageWhenScreenOff()).toBe(false);
  });

  it('leaves it alone when the pushed config does not carry it', async () => {
    await StorageService.savePausePageWhenScreenOff(true);

    await StorageService.importConfig({ general: { url: 'https://example.com' } });

    expect(await StorageService.getPausePageWhenScreenOff()).toBe(true);
  });
});
