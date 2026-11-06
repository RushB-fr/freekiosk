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
  // CAMERA_READY_DELAY (1500 ms), then one CAPTURE_INTERVAL tick (1000 ms) per frame:
  // 3 warm-up frames and the first real comparison
  for (let i = 0; i < 4; i++) {
    await act(async () => { jest.advanceTimersByTime(i === 0 ? 2500 : 1000); });
  }
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
  it('asks for a face only on real comparisons, never on warm-up frames', async () => {
    await captureOnce(true);
    expect(compareImages.mock.calls.slice(0, 4)).toEqual([
      ['/cache/frame.jpg', 0.08, false],
      ['/cache/frame.jpg', 0.08, false],
      ['/cache/frame.jpg', 0.08, false],
      ['/cache/frame.jpg', 0.08, true],
    ]);
  });

  it('does not ask for a face by default', async () => {
    await captureOnce();
    expect(compareImages.mock.calls[3]).toEqual(['/cache/frame.jpg', 0.08, false]);
  });
});
