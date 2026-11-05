/**
 * Waking the screen from outside the app starts the inactivity timer again, so the screensaver
 * comes back after the delay: a REST/MQTT `wake` or `screen_on`, and the screen turning on.
 * Those handlers are registered once on mount, and used to call the resetTimer of that first
 * render, which still saw the screensaver as off: they cleared the timer and armed none.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { DeviceEventEmitter } = require('react-native');

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
const DELAY = 1000;
const PRE_CHECK = 10_000; // MOTION_PRE_CHECK_DELAY_MS

// React Navigation emits 'focus' on mount; KioskScreen loads its settings on 'focus'
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
let log: jest.SpyInstance;

const expired = () =>
  log.mock.calls.filter((c: any[]) => String(c[0]).includes('Inactivity expired')).length;

// Settings load through several awaits: flush them without moving the clock
const settle = async () => { for (let i = 0; i < 20; i++) { await act(async () => {}); } };
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

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
    [K.SCREENSAVER_ENABLED, 'true'],
    [K.SCREENSAVER_INACTIVITY_DELAY, String(DELAY)],
    [K.SCREENSAVER_MOTION_ENABLED, 'true'], // the pre-check logs "Inactivity expired"
    [K.PAUSE_WEB_MEDIA_WHEN_HIDDEN, 'false'], // the WebView stand-in cannot inject scripts
  ]);
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('KioskScreen inactivity timer after an outside wake', () => {
  it.each(['onWake', 'onScreenOn'])('starts again after the %s command', async (command) => {
    await mount();
    await advance(DELAY / 2);
    act(() => { (ApiService as any).callbacks[command](); });
    await advance(DELAY);
    expect(expired()).toBe(1);
  });

  it('starts again when the screen turns on during the screensaver', async () => {
    await mount();
    await advance(DELAY + PRE_CHECK); // inactivity, then the pre-check: screensaver on
    expect(expired()).toBe(1);

    act(() => { DeviceEventEmitter.emit('onScreenStateChanged', true); });
    await advance(0); // the listener defers to the next tick
    await advance(DELAY);
    expect(expired()).toBe(2);
  });
});
