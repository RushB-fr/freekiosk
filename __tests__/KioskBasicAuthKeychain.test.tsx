/**
 * The Basic Auth password sits in the Keystore, which is slow on cheap devices and can throw
 * on broken ones (#258). Without a username the password is never used, so startup must not
 * read it.
 */
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
const Keychain = require('react-native-keychain');
const { StorageService } = require('../src/utils/storage');
const KioskScreen = require('../src/screens/KioskScreen').default;

const K = StorageService.KEYS;
const BASIC_AUTH_SERVICE = 'freekiosk_basic_auth_password';

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

async function mount() {
  act(() => { renderer = TestRenderer.create(React.createElement(KioskScreen, { navigation })); });
  for (const cb of listeners.focus ?? []) { await act(async () => { await cb(); }); }
  for (let i = 0; i < 20; i++) { await act(async () => {}); }
}

const basicAuthReads = () =>
  (Keychain.getGenericPassword as jest.Mock).mock.calls.filter(
    ([options]: [{ service?: string } | undefined]) => options?.service === BASIC_AUTH_SERVICE,
  ).length;

beforeEach(async () => {
  jest.useFakeTimers();
  listeners = {};
  (Keychain.getGenericPassword as jest.Mock).mockClear();
  await store.clear();
  await store.multiSet([
    [K.URL, 'https://example.com'],
    [K.DISPLAY_MODE, 'webview'],
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

describe('KioskScreen startup and the Basic Auth password', () => {
  it('does not read the Keystore when no Basic Auth username is set', async () => {
    await mount();
    expect(basicAuthReads()).toBe(0);
  });

  it('reads the password when a username is set', async () => {
    await store.setItem(K.HTTP_BASIC_AUTH_USERNAME, 'kiosk');
    await mount();
    expect(basicAuthReads()).toBe(1);
  });
});
