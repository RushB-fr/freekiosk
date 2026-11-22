/**
 * The REST/MQTT service belongs to the kiosk screens that use it: the screen can be mounted twice
 * in a row (an ADB config restarts the activity) and the first one's cleanup runs after the
 * second one's start. The command listener and MQTT must only stop with the last screen, or
 * every JS-handled command is dropped (HTTP 200, nothing happens) until the next reboot (#414).
 */
export {};

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

const { ApiService } = require('../src/utils/ApiService');

describe('ApiService owners', () => {
  let stopMqtt: jest.SpyInstance;
  let destroy: jest.SpyInstance;

  beforeEach(() => {
    stopMqtt = jest.spyOn(ApiService, 'stopMqtt').mockResolvedValue(undefined);
    destroy = jest.spyOn(ApiService, 'destroy').mockImplementation(() => {});
  });

  afterEach(() => {
    stopMqtt.mockRestore();
    destroy.mockRestore();
    (ApiService as any).owners = 0;
  });

  it('keeps the listener and MQTT while another screen still relies on them', () => {
    ApiService.retain(); // first mount
    ApiService.retain(); // second mount, before the first one is cleaned up
    ApiService.release(); // cleanup of the first
    expect(stopMqtt).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('stops them with the last screen', () => {
    ApiService.retain();
    ApiService.retain();
    ApiService.release();
    ApiService.release();
    expect(stopMqtt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('still stops when a screen is cleaned up before the next one mounts', () => {
    ApiService.retain();
    ApiService.release();
    expect(stopMqtt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    ApiService.retain();
    expect(stopMqtt).toHaveBeenCalledTimes(1);
  });

  it('never goes below zero', () => {
    ApiService.release();
    ApiService.release();
    ApiService.retain();
    ApiService.release();
    expect(destroy).toHaveBeenCalledTimes(3);
  });
});
