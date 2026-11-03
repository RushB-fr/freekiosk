/**
 * "Hide the URL on the error screen" (#217) travels in the config the tablet syncs with
 * FreeKiosk Cloud: out through exportConfig(), in through importConfig(). A config that does
 * not carry it (an older cloud) must leave it alone.
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

describe('hideErrorUrl in the synced config', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('exports it as off by default', async () => {
    const config: any = await StorageService.exportConfig();
    expect(config.general.hideErrorUrl).toBe(false);
  });

  it('imports it, and exports it back unchanged', async () => {
    await StorageService.importConfig({ general: { hideErrorUrl: true } });

    expect(await StorageService.getHideErrorUrl()).toBe(true);

    const config: any = await StorageService.exportConfig();
    expect(config.general.hideErrorUrl).toBe(true);
  });

  it('leaves it alone when the pushed config does not carry it', async () => {
    await StorageService.saveHideErrorUrl(true);

    await StorageService.importConfig({ general: { url: 'https://example.com' } });

    expect(await StorageService.getHideErrorUrl()).toBe(true);
  });
});
