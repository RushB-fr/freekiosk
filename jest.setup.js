// The app tree pulls in a dozen native modules that are null under Jest, so it cannot be
// imported without mocking them. Keep this list in sync when a new native dependency is
// added, otherwise every test that mounts a screen fails at import time.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  return { WebView, default: WebView };
});

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Camera: React.forwardRef((props, ref) => React.createElement(View, { ...props, ref })),
    useCameraDevice: () => undefined,
    useCameraDevices: () => [],
    useFrameProcessor: () => undefined,
    useCameraPermission: () => ({ hasPermission: false, requestPermission: jest.fn() }),
  };
});

jest.mock('@react-native-cookies/cookies', () => ({
  get: jest.fn(() => Promise.resolve({})),
  set: jest.fn(() => Promise.resolve(true)),
  clearAll: jest.fn(() => Promise.resolve(true)),
  flush: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/tmp',
  DocumentDirectoryPath: '/tmp',
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('')),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(false)),
  mkdir: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
}));

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
  ACCESSIBLE: {},
  ACCESS_CONTROL: {},
}));

// FreeKiosk's own native modules. Several are handed to `new NativeEventEmitter(...)`,
// which rejects a null argument, so the module object has to exist even when nothing in
// the test calls it. Every property answers with a resolved promise, which is what the TS
// bridges expect.
const { NativeModules } = require('react-native');

const nativeModuleStub = () =>
  new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'addListener' || prop === 'removeListeners') return jest.fn();
        if (typeof prop === 'symbol') return undefined;
        return jest.fn(() => Promise.resolve(null));
      },
    },
  );

[
  'AccessibilityModule',
  'AccessibilityServiceModule',
  'AppLauncherModule',
  'AudioControlModule',
  'DeviceEventManagerModule',
  'AutoBrightnessModule',
  'BlockingOverlayModule',
  'BluetoothControlModule',
  'CameraPhotoModule',
  'CertificateModule',
  'FilePickerModule',
  'FlashlightModule',
  'HttpServerModule',
  'KioskModule',
  'LauncherModule',
  'ManagedAppInstallerModule',
  'MotionDetectionModule',
  'MqttModule',
  'OverlayPermissionModule',
  'OverlayServiceModule',
  'PrintModule',
  'ProximityDetectionModule',
  'RotationControlModule',
  'SoundPlayerModule',
  'SystemInfoModule',
  'UpdateModule',
  'WifiControlModule',
].forEach(name => {
  NativeModules[name] = nativeModuleStub();
});
