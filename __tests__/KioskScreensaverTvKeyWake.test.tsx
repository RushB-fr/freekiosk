/**
 * Android TV has no touch screen: a remote key must wake the screensaver. MainActivity swallows the
 * key and emits `onTvKeyWake`; the Kiosk screen wakes the screensaver as a tap does, and tells
 * native when the screensaver is showing (`setScreensaverShowing`) so that key is consumed.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { StyleSheet, DeviceEventEmitter, NativeModules } = require('react-native');

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

// The shared stub makes a new jest.fn on every read, so record the calls here, before the
// Kiosk screen (and the KioskModule wrapper) are imported.
const showingCalls: boolean[] = [];
const baseKioskModule = NativeModules.KioskModule;
NativeModules.KioskModule = new Proxy({}, {
  get: (_target: object, prop: string | symbol) => {
    if (prop === 'setScreensaverShowing') {
      return (value: boolean) => { showingCalls.push(value); return Promise.resolve(true); };
    }
    return (baseKioskModule as any)[prop];
  },
});

const AsyncStorageModule = require('@react-native-async-storage/async-storage');
const store = AsyncStorageModule.default ?? AsyncStorageModule;
const { StorageService } = require('../src/utils/storage');
const KioskScreen = require('../src/screens/KioskScreen').default;

const K = StorageService.KEYS;
const DELAY = 1000;

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
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

async function mount() {
  act(() => { renderer = TestRenderer.create(React.createElement(KioskScreen, { navigation })); });
  for (const cb of listeners.focus ?? []) { await act(async () => { await cb(); }); }
  await settle();
}

// The overlay is the only element with zIndex 1000 (styles.screensaverOverlay)
const screensaverShown = () =>
  renderer.root.findAll((n: any) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.zIndex === 1000).length > 0;

// The page's own WebView (the screensaver overlay has no onUserInteraction)
const pageInteraction = (event?: object) => {
  const [webView] = renderer.root.findAll((n: any) => typeof n.props.onUserInteraction === 'function');
  return act(async () => { await webView.props.onUserInteraction(event); });
};

beforeEach(async () => {
  jest.useFakeTimers();
  listeners = {};
  await store.clear();
  await store.multiSet([
    [K.URL, 'https://example.com'],
    [K.DISPLAY_MODE, 'webview'],
    [K.SCREENSAVER_ENABLED, 'true'],
    [K.SCREENSAVER_INACTIVITY_DELAY, String(DELAY)],
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


const emitKey = () => act(async () => { DeviceEventEmitter.emit('onTvKeyWake'); });

describe('KioskScreen screensaver and the TV remote', () => {
  it('wakes on a remote key and tells native when it is showing and when it is not', async () => {
    await mount();
    expect(showingCalls[showingCalls.length - 1]).toBe(false);

    await advance(DELAY);
    expect(screensaverShown()).toBe(true);
    expect(showingCalls[showingCalls.length - 1]).toBe(true);

    await emitKey();
    expect(screensaverShown()).toBe(false);
    expect(showingCalls[showingCalls.length - 1]).toBe(false);
  });

  it('does nothing when the screensaver is not showing', async () => {
    await mount();
    expect(screensaverShown()).toBe(false);
    await emitKey();
    expect(screensaverShown()).toBe(false);
  });

  it('the screensaver comes back after a key wake and some idle time', async () => {
    await mount();
    await advance(DELAY);
    expect(screensaverShown()).toBe(true);
    await emitKey();
    expect(screensaverShown()).toBe(false);
    await advance(DELAY + 100);
    expect(screensaverShown()).toBe(true);
  });
});
