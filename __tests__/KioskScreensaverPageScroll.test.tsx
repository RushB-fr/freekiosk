/**
 * #344 lets the inactivity return run behind the screensaver. Its scroll-to-top makes the page
 * scroll, and the WebView reports a scroll as 'user-interaction' (no event payload). That must
 * not wake the screensaver: the overlay covers the page, so only the page itself can scroll it.
 * A tap still wakes it.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { StyleSheet } = require('react-native');

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

describe('KioskScreen screensaver and page events', () => {
  it('stays on when the page scrolls itself', async () => {
    await mount();
    await advance(DELAY);
    expect(screensaverShown()).toBe(true);

    await pageInteraction();
    expect(screensaverShown()).toBe(true);
  });

  it('wakes on a tap', async () => {
    await mount();
    await advance(DELAY);
    expect(screensaverShown()).toBe(true);

    await pageInteraction({ isTap: true, x: 10, y: 10 });
    expect(screensaverShown()).toBe(false);
  });
});
