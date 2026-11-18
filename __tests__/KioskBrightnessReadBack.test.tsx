/**
 * The brightness the REST API and MQTT report is read back from the native side when the screensaver
 * goes on or off. The restore of the default brightness runs in an effect at the same moment, so
 * the first read could still see the screensaver's dim level: on a tablet GET /api/brightness
 * answered 1 while the display was back at 80 %. A second read, once the restore has landed,
 * reports the real level.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
// The level the native side would answer; changed by the test to play the restore landing late.
let mockNativeBrightness = 0.8;
jest.mock('../src/utils/BrightnessModule', () => ({
  __esModule: true,
  default: {
    getBrightnessLevel: jest.fn(async () => mockNativeBrightness),
    setBrightnessLevel: jest.fn(async () => {}),
    setDefaultBrightness: jest.fn(async () => true),
  },
}));

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
let updateStatus: jest.SpyInstance;

const settle = async () => { for (let i = 0; i < 20; i++) { await act(async () => {}); } };
const callback = (name: string, ...args: unknown[]) =>
  act(async () => { await (ApiService as any).callbacks[name](...args); });
const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

const reportedBrightness = (): number | undefined => {
  const calls = updateStatus.mock.calls.filter(([s]) => s && s.brightness !== undefined);
  return calls.length ? calls[calls.length - 1][0].brightness : undefined;
};

async function mount() {
  act(() => { renderer = TestRenderer.create(React.createElement(KioskScreen, { navigation })); });
  for (const cb of listeners.focus ?? []) { await act(async () => { await cb(); }); }
  await settle();
}

beforeEach(async () => {
  jest.useFakeTimers();
  listeners = {};
  mockNativeBrightness = 0.8;
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
  updateStatus = jest.spyOn(ApiService, 'updateStatus');
});

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the brightness reported after the screensaver goes off', () => {
  it('is the restored level, not the dim level read before the restore landed', async () => {
    await mount();
    expect(reportedBrightness()).toBe(80);

    await callback('onScreensaverOn');
    await advance(2000);

    // The screensaver goes off: the first read still sees the dim window level ...
    mockNativeBrightness = 0.01;
    await callback('onScreensaverOff');
    // ... then the restore of the default brightness lands.
    await advance(100);
    mockNativeBrightness = 0.8;
    await advance(1500);
    await settle();

    expect(reportedBrightness()).toBe(80);
  });
});
