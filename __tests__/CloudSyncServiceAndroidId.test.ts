/**
 * #300: the tablet's ANDROID_ID reaches the cloud, to match a tablet with the identifier its local
 * REST API shows.
 *
 *   - enrollment sends it in `device_info.android_id`
 *   - every heartbeat sends it in `system.android_id`
 *   - a device that cannot read it sends no such key, so nothing changes for it (and an older cloud
 *     ignores the key anyway)
 */
// A module of its own: other test files declare helpers of the same name.
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const mockGetStatus = jest.fn();
jest.mock('../src/services/DeviceControlService', () => ({
  __esModule: true,
  default: { getStatus: (...args: any[]) => mockGetStatus(...args) },
}));

jest.mock('../src/utils/capabilities', () => ({
  getCapabilities: () => Promise.resolve(['brightness']),
}));

jest.mock('../src/utils/secureStorage', () => ({
  ...jest.requireActual('../src/utils/secureStorage'),
  getCloudCredentials: jest.fn(),
  saveCloudCredentials: jest.fn(() => Promise.resolve(true)),
  clearCloudCredentials: jest.fn(() => Promise.resolve()),
}));

const { CloudSyncService } = require('../src/utils/CloudSyncService');

const CREDS = {
  deviceId: 'dev-1',
  apiKey: 'fk_test',
  cloudUrl: 'https://cloud.test',
  organizationName: 'Test Org',
};

function status(androidId?: string) {
  return {
    battery: { level: 80, charging: false, plugged: 'none', present: true },
    screen: { on: true, brightness: 50 },
    webview: { currentUrl: 'https://example.test' },
    device: {
      ip: '192.168.1.20',
      kioskMode: true,
      isDeviceOwner: false,
      version: '2.1.0',
      model: 'Test',
      manufacturer: 'Test',
      androidVersion: '15',
      freeStorageMb: 1000,
      freeMemoryMb: 500,
      uptime: 10,
      ...(androidId ? { androidId } : {}),
    },
    wifi: { ssid: 'home', signalStrength: -50, connected: true, ethernet: false },
    cellular: { connected: false, carrier: '', networkType: '', signalDbm: 0, airplaneMode: false },
    timestamp: 0,
  };
}

async function heartbeatBody(androidId?: string) {
  mockGetStatus.mockResolvedValue(status(androidId));
  let body: any;
  (globalThis as any).fetch = jest.fn((_url: string, init: any) => {
    body = JSON.parse(init.body);
    return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ config_version: 0 }) });
  });
  await CloudSyncService.sendHeartbeat(CREDS, { force: true });
  return body;
}

async function enrollBody(getSystemInfo: any) {
  NativeModules.KioskModule = getSystemInfo === undefined ? {} : { getSystemInfo };
  let body: any;
  (globalThis as any).fetch = jest.fn((_url: string, init: any) => {
    body = JSON.parse(init.body);
    return Promise.resolve({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ device_id: 'dev-1', api_key: 'fk_secret', organization_name: 'Test Org' }),
    });
  });
  await CloudSyncService.enroll('https://cloud.test/', 'tok', { model: 'RK3568' });
  return body;
}

describe('ANDROID_ID in the heartbeat', () => {
  it('sends it with the system telemetry', async () => {
    const body = await heartbeatBody('a1b2c3d4e5f60718');

    expect(body.system.android_id).toBe('a1b2c3d4e5f60718');
    expect(body.system.model).toBe('Test');
  });

  it('sends no key when the device could not read it', async () => {
    const body = await heartbeatBody(undefined);

    expect(body.system).not.toHaveProperty('android_id');
    expect(body.system.model).toBe('Test');
  });
});

describe('ANDROID_ID at enrollment', () => {
  it('sends it in device_info next to what was already sent', async () => {
    const body = await enrollBody(() => Promise.resolve({ androidId: 'a1b2c3d4e5f60718', model: 'x' }));

    expect(body.device_info.android_id).toBe('a1b2c3d4e5f60718');
    expect(body.device_info.model).toBe('RK3568');
    expect(body.device_info.capabilities).toEqual(['brightness']);
    expect(body.token).toBe('tok');
  });

  it.each([
    ['an empty identifier', () => Promise.resolve({ androidId: '' })],
    ['no identifier', () => Promise.resolve({})],
    ['a native call that fails', () => Promise.reject(new Error('boom'))],
  ])('sends no key for %s', async (_label, getSystemInfo) => {
    const body = await enrollBody(getSystemInfo);

    expect(body.device_info).not.toHaveProperty('android_id');
    expect(body.device_info.model).toBe('RK3568');
  });

  it('sends no key when the native module has no getSystemInfo', async () => {
    const body = await enrollBody(undefined);

    expect(body.device_info).not.toHaveProperty('android_id');
  });
});
