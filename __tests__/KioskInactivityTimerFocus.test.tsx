/**
 * The screensaver's inactivity timer belongs to the Kiosk screen while it is in front.
 *   - it does not fire after the screen is unmounted (Settings returns with navigation.reset)
 *   - nothing arms it while PIN or Settings is in front (the click that follows the last tap
 *     of the N-tap sequence, or a REST/MQTT wake), so the screensaver cannot dim the PIN page
 *   - it runs again once the Kiosk screen is back in front (back from the PIN page)
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

let mockFocused = true;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const R = require('react');
  return {
    ...actual,
    useIsFocused: () => mockFocused,
    useNavigation: () => ({ addListener: () => () => {}, navigate: () => {} }),
    useFocusEffect: (effect: () => void | (() => void)) => { R.useEffect(effect, [effect]); },
  };
});

const AsyncStorageModule = require('@react-native-async-storage/async-storage');
const store = AsyncStorageModule.default ?? AsyncStorageModule;
const { StorageService } = require('../src/utils/storage');
const KioskScreen = require('../src/screens/KioskScreen').default;

const K = StorageService.KEYS;
const DELAY = 1000;

// React Navigation emits 'focus' on mount and on every return, 'blur' when another screen
// comes in front; KioskScreen loads its settings on 'focus'
let listeners: Record<string, Array<() => unknown>> = {};
const navigation = {
  addListener: (event: string, cb: () => unknown) => {
    (listeners[event] ??= []).push(cb);
    return () => { listeners[event] = listeners[event].filter(l => l !== cb); };
  },
  navigate: jest.fn(),
  reset: jest.fn(),
  isFocused: () => mockFocused,
};

let renderer: any;
let log: jest.SpyInstance;

const expired = () =>
  log.mock.calls.filter((c: any[]) => String(c[0]).includes('Inactivity expired')).length;

// Settings load through several awaits: flush them without moving the clock
const settle = async () => { for (let i = 0; i < 20; i++) { await act(async () => {}); } };
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

const emit = async (event: string) => {
  for (const cb of [...(listeners[event] ?? [])]) { await act(async () => { await cb(); }); }
  await settle();
};

async function mount() {
  act(() => { renderer = TestRenderer.create(React.createElement(KioskScreen, { navigation })); });
  await emit('focus');
}

async function setFocused(focused: boolean) {
  mockFocused = focused;
  act(() => { renderer.update(React.createElement(KioskScreen, { navigation })); });
  await emit(focused ? 'focus' : 'blur');
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockFocused = true;
  listeners = {};
  await store.clear();
  await store.multiSet([
    [K.URL, 'https://example.com'],
    [K.DISPLAY_MODE, 'webview'],
    [K.SCREENSAVER_ENABLED, 'true'],
    [K.SCREENSAVER_INACTIVITY_DELAY, String(DELAY)],
    [K.SCREENSAVER_MOTION_ENABLED, 'true'], // the pre-check logs "Inactivity expired"
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

describe('KioskScreen inactivity timer', () => {
  it('expires after the delay while the Kiosk screen is in front', async () => {
    await mount();
    await advance(DELAY);
    expect(expired()).toBe(1);
  });

  it('does not expire after the screen is unmounted', async () => {
    await mount();
    act(() => { renderer.unmount(); });
    renderer = null;
    await advance(DELAY * 3);
    expect(expired()).toBe(0);
  });

  it('is not armed by a page interaction while the PIN page is in front', async () => {
    await mount();
    await setFocused(false);
    // The click that follows the last tap of the N-tap sequence arrives after the navigation
    const webView = renderer.root.find((node: any) => typeof node.props.onUserInteraction === 'function');
    await act(async () => { await webView.props.onUserInteraction(); });
    await advance(DELAY * 3);
    expect(expired()).toBe(0);
  });

  it('runs again when the Kiosk screen is back in front', async () => {
    await mount();
    await setFocused(false);
    await advance(DELAY * 3);
    await setFocused(true);
    await advance(DELAY);
    expect(expired()).toBe(1);
  });
});
