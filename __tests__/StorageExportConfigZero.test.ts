/**
 * exportConfig() must hand back a stored 0 as 0.
 *
 * FreeKiosk Cloud treats a config as applied once the tablet reports it back unchanged.
 * `num()` used `parseFloat(v) || default`, so every 0 came back as the default: camera
 * rotation 0 as -1 (automatic), "no limit" (0) for the MQTT screenshot width as 1280, the
 * WebView back button at the left edge as 2 %. The cloud then saw a config different from
 * the one it had pushed, never marked it applied, and kept pushing it.
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
const { StorageService, KEYS } = require('../src/utils/storage');

const store = AsyncStorage.default ?? AsyncStorage;

describe('StorageService.exportConfig with zero values', () => {
  beforeEach(async () => {
    await store.clear();
  });

  it.each([
    ['camera rotation 0 (default is -1, automatic)', KEYS.CAMERA_STREAM_ROTATE, ['advanced', 'cameraStream', 'rotate']],
    ['MQTT screenshot width 0 (no limit)', KEYS.MQTT_SCREENSHOT_MAX_WIDTH, ['advanced', 'mqtt', 'screenshot', 'maxWidth']],
    ['WebView back button x at 0 %', KEYS.WEBVIEW_BACK_BUTTON_X_PERCENT, ['general', 'webviewBackButton', 'xPercent']],
    ['WebView back button y at 0 %', KEYS.WEBVIEW_BACK_BUTTON_Y_PERCENT, ['general', 'webviewBackButton', 'yPercent']],
    ['default brightness 0', KEYS.DEFAULT_BRIGHTNESS, ['display', 'defaultBrightness']],
  ])('keeps %s', async (_label, key, path) => {
    await store.setItem(key, '0');

    const config = await StorageService.exportConfig();

    let node: any = config;
    for (const part of path) node = node[part];
    expect(node).toBe(0);
  });

  it('still falls back to the default when nothing is stored', async () => {
    const config: any = await StorageService.exportConfig();

    expect(config.advanced.cameraStream.rotate).toBe(-1);
    expect(config.advanced.mqtt.screenshot.maxWidth).toBe(1280);
    expect(config.general.webviewBackButton.xPercent).toBe(2);
  });

  it('falls back to the default for a value that is not a number', async () => {
    await store.setItem(KEYS.CAMERA_STREAM_FPS, 'abc');

    const config: any = await StorageService.exportConfig();

    expect(config.advanced.cameraStream.fps).toBe(10);
  });
});
