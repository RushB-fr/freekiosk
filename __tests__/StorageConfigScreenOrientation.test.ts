/**
 * The Screen Orientation setting (#189) travels in the config the tablet syncs with FreeKiosk
 * Cloud: out through exportConfig(), in through importConfig(). A config that does not carry it
 * (an older cloud) must leave it alone.
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

describe('screenOrientation in the synced config', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('exports auto by default', async () => {
    const config: any = await StorageService.exportConfig();
    expect(config.display.screenOrientation).toBe('auto');
  });

  it('imports it, and exports it back unchanged', async () => {
    await StorageService.importConfig({ display: { screenOrientation: 'landscape' } });

    expect(await StorageService.getScreenOrientation()).toBe('landscape');

    const config: any = await StorageService.exportConfig();
    expect(config.display.screenOrientation).toBe('landscape');
  });

  it('leaves it alone when the pushed config does not carry it', async () => {
    await StorageService.saveScreenOrientation('reverse_portrait');

    await StorageService.importConfig({ display: { keyboardMode: 'default' } });

    expect(await StorageService.getScreenOrientation()).toBe('reverse_portrait');
  });
});
