/**
 * The URL rotation pause (#235) travels in the config the tablet syncs with FreeKiosk Cloud:
 * out through exportConfig(), in through importConfig(). A config that does not carry it
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

describe('URL rotation pause in the synced config', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('exports it as off, with a 60 s resume delay, by default', async () => {
    const config: any = await StorageService.exportConfig();
    expect(config.general.urlRotation.pauseOnTouch).toBe(false);
    expect(config.general.urlRotation.resumeDelay).toBe(60);
  });

  it('imports both, and exports them back unchanged', async () => {
    await StorageService.importConfig({
      general: { urlRotation: { enabled: true, list: ['https://a', 'https://b'], interval: 30, pauseOnTouch: true, resumeDelay: 90 } },
    });

    expect(await StorageService.getUrlRotationPauseOnTouch()).toBe(true);
    expect(await StorageService.getUrlRotationResumeDelay()).toBe(90);

    const config: any = await StorageService.exportConfig();
    expect(config.general.urlRotation.pauseOnTouch).toBe(true);
    expect(config.general.urlRotation.resumeDelay).toBe(90);
  });

  it('leaves them alone when the pushed rotation does not carry them', async () => {
    await StorageService.saveUrlRotationPauseOnTouch(true);
    await StorageService.saveUrlRotationResumeDelay(45);

    await StorageService.importConfig({ general: { urlRotation: { enabled: true, list: [], interval: 30 } } });

    expect(await StorageService.getUrlRotationPauseOnTouch()).toBe(true);
    expect(await StorageService.getUrlRotationResumeDelay()).toBe(45);
  });

  it('never reads a resume delay below 5 seconds', async () => {
    await StorageService.saveUrlRotationResumeDelay(1);
    expect(await StorageService.getUrlRotationResumeDelay()).toBe(5);
  });
});
