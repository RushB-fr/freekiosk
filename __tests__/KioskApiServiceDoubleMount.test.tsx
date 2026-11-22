/**
 * #414: an ADB config restarts the activity and the kiosk screen mounts twice in the new
 * process. The first screen's cleanup ran after the second one had adopted the command
 * listener, removed it and stopped MQTT: REST commands handled in JS answered 200 and did
 * nothing until a reboot. Only the last screen to go may stop the service.
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

const navigation = {
  addListener: () => () => {},
  navigate: jest.fn(),
  reset: jest.fn(),
  isFocused: () => true,
};

const settle = async () => { for (let i = 0; i < 20; i++) { await act(async () => {}); } };
const mount = async () => {
  let renderer: any;
  act(() => { renderer = TestRenderer.create(React.createElement(KioskScreen, { navigation })); });
  await settle();
  return renderer;
};

let stopMqtt: jest.SpyInstance;
let destroy: jest.SpyInstance;

beforeEach(async () => {
  jest.useFakeTimers();
  await store.clear();
  await store.multiSet([
    [K.URL, 'https://example.com'],
    [K.DISPLAY_MODE, 'webview'],
    [K.PAUSE_WEB_MEDIA_WHEN_HIDDEN, 'false'], // the WebView stand-in cannot inject scripts
  ]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  stopMqtt = jest.spyOn(ApiService, 'stopMqtt').mockResolvedValue(undefined);
  destroy = jest.spyOn(ApiService, 'destroy');
  (ApiService as any).owners = 0;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  (ApiService as any).owners = 0;
});

describe('KioskScreen mounted twice in a row', () => {
  it('keeps the service when the first screen unmounts after the second one started', async () => {
    const first = await mount();
    const second = await mount();
    act(() => { first.unmount(); });
    await settle();
    expect(stopMqtt).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    act(() => { second.unmount(); });
    await settle();
    expect(stopMqtt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('still stops the service when the only screen unmounts', async () => {
    const only = await mount();
    act(() => { only.unmount(); });
    await settle();
    expect(stopMqtt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
