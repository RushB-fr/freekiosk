/**
 * "Only wake for a face": MotionDetector hands the setting to the native comparison, which
 * owns the face check (it has the decoded frame). Off unless the prop says otherwise.
 */
// A module of its own so the helpers do not collide with another test file's
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { NativeModules } = require('react-native');

// Before MotionDetector is required: the bridge module reads NativeModules at import time
const compareImages = jest.fn(() => Promise.resolve(false));
NativeModules.MotionDetectionModule = { compareImages, reset: jest.fn(() => Promise.resolve(true)) };

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

async function captureOnce(requireFace?: boolean) {
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(MotionDetector, {
        enabled: true,
        onMotionDetected: jest.fn(),
        sensitivity: 'medium',
        requireFace,
      }),
    );
  });
  act(() => { mockCameraProps.onInitialized(); });
  // CAMERA_READY_DELAY (1500 ms), then the first CAPTURE_INTERVAL tick (1000 ms)
  await act(async () => { jest.advanceTimersByTime(2500); });
}

beforeEach(() => {
  jest.useFakeTimers();
  compareImages.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('MotionDetector requireFace', () => {
  it('asks the native comparison for a face when the option is on', async () => {
    await captureOnce(true);
    expect(compareImages).toHaveBeenCalledWith('/cache/frame.jpg', 0.08, true);
  });

  it('does not ask for a face by default', async () => {
    await captureOnce();
    expect(compareImages).toHaveBeenCalledWith('/cache/frame.jpg', 0.08, false);
  });
});
