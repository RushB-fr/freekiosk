import {
  DEFAULT_MULTI_APP_APPEARANCE,
  getMultiAppForeground,
  normalizeMultiAppAppearance,
  parseMultiAppAppearance,
} from '../src/types/multiAppAppearance';

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { StorageService, KEYS } = require('../src/utils/storage');
const store = AsyncStorage.default ?? AsyncStorage;

describe('Multi-App appearance', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it('keeps defaults for existing installations and corrupt storage', async () => {
    expect(await StorageService.getMultiAppAppearance()).toEqual(
      DEFAULT_MULTI_APP_APPEARANCE,
    );
    expect(parseMultiAppAppearance('{broken')).toEqual(
      DEFAULT_MULTI_APP_APPEARANCE,
    );
    const config = await StorageService.exportConfig();
    expect(config.general.externalApp.appearance).toEqual(
      DEFAULT_MULTI_APP_APPEARANCE,
    );
  });

  it('round-trips custom branding, hidden elements and colour through storage/config', async () => {
    const appearance = {
      backgroundColor: '#ffffff',
      title: 'Mawson Technology',
      logoUri: 'file:///data/user/0/com.freekiosk/files/logo.png',
      showTitle: false,
      showLogo: false,
    };
    await StorageService.saveMultiAppAppearance(appearance);
    const config = await StorageService.exportConfig();
    expect(config.general.externalApp.appearance).toEqual(appearance);
    await store.clear();
    await StorageService.importConfig(config);
    expect(await StorageService.getMultiAppAppearance()).toEqual(appearance);
    await StorageService.clearAll();
    expect(await store.getItem(KEYS.MULTI_APP_APPEARANCE)).toBeNull();
  });

  it('does not reset appearance when importing an older config', async () => {
    const appearance = { ...DEFAULT_MULTI_APP_APPEARANCE, title: 'Reception' };
    await StorageService.saveMultiAppAppearance(appearance);
    await StorageService.importConfig({
      general: { externalApp: { mode: 'multi' } },
    });
    expect(await StorageService.getMultiAppAppearance()).toEqual(appearance);
  });

  it('normalizes invalid imported colours and visibility values without losing a blank title', () => {
    expect(
      normalizeMultiAppAppearance({
        backgroundColor: 'invalid',
        title: '',
        showTitle: 'false',
        logoUri: 'https://example.com/logo.png',
      }),
    ).toEqual({ ...DEFAULT_MULTI_APP_APPEARANCE, title: '' });
    expect(
      normalizeMultiAppAppearance({
        backgroundColor: ' #ABCDEF ',
        showLogo: false,
      }).backgroundColor,
    ).toBe('#ABCDEF');
  });

  it('uses dark text on light backgrounds and light text on dark backgrounds', () => {
    expect(getMultiAppForeground('#ffffff')).toBe('#000000');
    expect(getMultiAppForeground('#000000')).toBe('#ffffff');
    expect(getMultiAppForeground('#ffff00')).toBe('#000000');
    expect(getMultiAppForeground('#000080')).toBe('#ffffff');
  });
});
