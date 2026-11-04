/**
 * KioskScreen hands MotionDetector a new onMotionDetected on every render. A new callback must
 * not restart detection: a restart resets the native reference frame and runs the camera
 * warm-up again, which left detection blind for ~4.5 s each time the screensaver came on.
 * The latest callback is still the one called.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { NativeModules } = require('react-native');

// Before MotionDetector is required: the bridge module reads NativeModules at import time
const compareImages = jest.fn(() => Promise.resolve(false));
const reset = jest.fn(() => Promise.resolve(true));
NativeModules.MotionDetectionModule = { compareImages, reset };

let mockCameraProps: any = null;

jest.mock('react-native-vision-camera', () => {
  const R = require('react');
  // the real hook returns the same object while the device does not change
  const device = { supportsLowLightBoost: false };
  return {
    Camera: R.forwardRef((props: any, ref: any) => {
      mockCameraProps = props;
      R.useImperativeHandle(ref, () => ({
        takePhoto: () => Promise.resolve({ path: '/cache/frame.jpg' }),
      }));
      return null;
    }),
    useCameraDevice: () => device,
    useCameraPermission: () => ({ hasPermission: true }),
  };
});

const MotionDetector = require('../src/components/MotionDetector').default;

let renderer: any;

const element = (onMotionDetected: () => void, referenceKey?: unknown) =>
  React.createElement(MotionDetector, { enabled: true, onMotionDetected, sensitivity: 'medium', referenceKey });

// CAMERA_READY_DELAY (1500 ms), then one capture per CAPTURE_INTERVAL (1000 ms)
// In 100 ms steps so each capture's promises settle before the next tick (a tick that finds a
// capture still running is skipped)
const advance = async (ms: number) => {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => { jest.advanceTimersByTime(100); });
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  compareImages.mockReset();
  compareImages.mockImplementation(() => Promise.resolve(false));
  reset.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('MotionDetector with a new onMotionDetected', () => {
  it('keeps detecting without a reset or a new warm-up', async () => {
    act(() => { renderer = TestRenderer.create(element(jest.fn())); });
    act(() => { mockCameraProps.onInitialized(); });
    await advance(5500); // past the three warm-up frames
    const resetsBefore = reset.mock.calls.length;
    const comparesBefore = compareImages.mock.calls.length;

    act(() => { renderer.update(element(jest.fn())); });
    await advance(1000);

    expect(reset.mock.calls.length).toBe(resetsBefore);
    // the capture interval kept running: a restart would wait CAMERA_READY_DELAY first
    expect(compareImages.mock.calls.length).toBe(comparesBefore + 1);
  });

  it('calls the latest callback', async () => {
    const first = jest.fn();
    const latest = jest.fn();
    act(() => { renderer = TestRenderer.create(element(first)); });
    act(() => { mockCameraProps.onInitialized(); });
    await advance(5500);

    act(() => { renderer.update(element(latest)); });
    compareImages.mockImplementation(() => Promise.resolve(true));
    await advance(1000);

    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

// The screensaver dims the screen, and the camera sees the room go darker: that must not count
// as movement. A new referenceKey takes a new reference frame and skips the warm-up frames again.
describe('MotionDetector with a new referenceKey', () => {
  it('takes a new reference and ignores the warm-up frames', async () => {
    const onMotion = jest.fn();
    act(() => { renderer = TestRenderer.create(element(onMotion, false)); });
    act(() => { mockCameraProps.onInitialized(); });
    await advance(5500);
    const resetsBefore = reset.mock.calls.length;

    compareImages.mockImplementation(() => Promise.resolve(true)); // the dimmed frames differ
    act(() => { renderer.update(element(onMotion, true)); });
    await advance(3000); // the three warm-up frames

    expect(reset.mock.calls.length).toBe(resetsBefore + 1);
    expect(onMotion).not.toHaveBeenCalled();

    await advance(1000); // the first real comparison
    expect(onMotion).toHaveBeenCalledTimes(1);
  });
});

describe('MotionDetector with an unchanged referenceKey', () => {
  it('does not reset on a new callback', async () => {
    act(() => { renderer = TestRenderer.create(element(jest.fn(), true)); });
    act(() => { mockCameraProps.onInitialized(); });
    await advance(5500);
    const resetsBefore = reset.mock.calls.length;

    act(() => { renderer.update(element(jest.fn(), true)); });
    await advance(1000);

    expect(reset.mock.calls.length).toBe(resetsBefore);
  });
});
