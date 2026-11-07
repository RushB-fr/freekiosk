/**
 * The REST/MQTT handlers are registered once on mount. They used to read the brightness state
 * of that first render: enabling auto-brightness saved 0.5 as the manual level to restore
 * (so Home Assistant's switch ON then OFF left the screen at 50 %), and a manual brightness
 * over the API did not turn off an auto-brightness that was already on at startup.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const R = require('react');
  return {
    ...actual,
    useIsFocused: () => true,
    useNavigation: () => ({ addListener: () => () => {}, navigate: () => {} }),
    useFocusEffect: (effect: () => void | (() => void)) => { R.useEffect(effect, [effect]); },
  };
});

const AsyncStorageModule = require('@react-native-async-storage/async-storage');
const store = AsyncStorageModule.default ?? AsyncStorageModule;
const { StorageService } = require('../src/utils/storage');
const { ApiService } = require('../src/utils/ApiService');
const KioskScreen = require('../src/screens/KioskScreen').default;

const K = StorageService.KEYS;

let listeners: Record<string, Array<() => unknown>> = {};
const navigation = {
  addListener: (event: string, cb: () => unknown) => {
    (listeners[event] ??= []).push(cb);
    return () => { listeners[event] = listeners[event].filter(l => l !== cb); };
  },
  navigate: jest.fn(),
  reset: jest.fn(),
  isFocused: () => true,
};

let renderer: any;

const settle = async () => { for (let i = 0; i < 20; i++) { await act(async () => {}); } };
const callback = (name: string, ...args: unknown[]) =>
  act(async () => { await (ApiService as any).callbacks[name](...args); });

async function mount() {
  act(() => { renderer = TestRenderer.create(React.createElement(KioskScreen, { navigation })); });
  for (const cb of listeners.focus ?? []) { await act(async () => { await cb(); }); }
  await settle();
}

beforeEach(async () => {
  jest.useFakeTimers();
  listeners = {};
  await store.clear();
  await store.multiSet([
    [K.URL, 'https://example.com'],
    [K.DISPLAY_MODE, 'webview'],
    [K.DEFAULT_BRIGHTNESS, '0.8'],
    [K.PAUSE_WEB_MEDIA_WHEN_HIDDEN, 'false'], // the WebView stand-in cannot inject scripts
  ]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('KioskScreen API handlers read the current brightness state', () => {
  it('saves the configured brightness as the level to restore', async () => {
    await mount();
    await callback('onAutoBrightnessEnable', 10, 100);
    expect(await StorageService.getAutoBrightnessSavedManual()).toBe(0.8);
  });

  it('turns off an auto-brightness that was on at startup when a brightness is set', async () => {
    await store.setItem(K.AUTO_BRIGHTNESS_ENABLED, 'true');
    await mount();
    await callback('onSetBrightness', 50);
    expect(await StorageService.getAutoBrightnessEnabled()).toBe(false);
  });
});
