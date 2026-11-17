/**
 * Pull to refresh travels in the config the tablet syncs with FreeKiosk Cloud: out through
 * exportConfig(), in through importConfig(). A config that does not carry it (an older cloud)
 * must leave it alone.
 */
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const AsyncStorage = require('@react-native-async-storage/async-storage');
const { StorageService } = require('../src/utils/storage');

const store = AsyncStorage.default ?? AsyncStorage;

describe('pull to refresh in the synced config', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('exports it as off by default', async () => {
    const config: any = await StorageService.exportConfig();
    expect(config.display.pullToRefresh).toBe(false);
  });

  it('imports it, and exports it back unchanged', async () => {
    await StorageService.importConfig({ display: { pullToRefresh: true } });

    expect(await StorageService.getPullToRefresh()).toBe(true);
    const config: any = await StorageService.exportConfig();
    expect(config.display.pullToRefresh).toBe(true);
  });

  it('leaves it alone when the pushed config does not carry it', async () => {
    await StorageService.savePullToRefresh(true);

    await StorageService.importConfig({ general: { url: 'https://example.com' }, display: {} });

    expect(await StorageService.getPullToRefresh()).toBe(true);
  });
});
