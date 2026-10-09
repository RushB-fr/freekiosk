/**
 * The session reset button (#156) and the overscroll option (#233) travel in the config
 * the tablet syncs with FreeKiosk Cloud: out through exportConfig(), in through
 * importConfig(). A config that does not carry them (an older cloud) must leave them alone.
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

describe('session reset button and overscroll in the synced config', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('exports both as off by default', async () => {
    const config: any = await StorageService.exportConfig();
    expect(config.general.sessionResetButtonEnabled).toBe(false);
    expect(config.display.disableOverscroll).toBe(false);
  });

  it('imports both, and exports them back unchanged', async () => {
    await StorageService.importConfig({
      general: { sessionResetButtonEnabled: true },
      display: { disableOverscroll: true },
    });

    expect(await StorageService.getSessionResetButtonEnabled()).toBe(true);
    expect(await StorageService.getDisableOverscroll()).toBe(true);

    const config: any = await StorageService.exportConfig();
    expect(config.general.sessionResetButtonEnabled).toBe(true);
    expect(config.display.disableOverscroll).toBe(true);
  });

  it('leaves them alone when the pushed config does not carry them', async () => {
    await StorageService.saveSessionResetButtonEnabled(true);
    await StorageService.saveDisableOverscroll(true);

    await StorageService.importConfig({ general: { url: 'https://example.com' }, display: {} });

    expect(await StorageService.getSessionResetButtonEnabled()).toBe(true);
    expect(await StorageService.getDisableOverscroll()).toBe(true);
  });
});
