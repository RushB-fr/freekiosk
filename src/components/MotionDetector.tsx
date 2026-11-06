import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import MotionDetectionModule from '../utils/MotionDetectionModule';
import { httpServer } from '../utils/HttpServerModule';

export type MotionStatus = 'idle' | 'active' | 'error' | 'no-camera';

interface MotionDetectorProps {
  enabled: boolean;
  onMotionDetected: () => void;
  sensitivity: 'low' | 'medium' | 'high';
  cameraPosition?: 'front' | 'back';
  /** Only trigger when a face is in the frame (checked natively, see MotionDetectionModule.kt) */
  requireFace?: boolean;
  onStatusChange?: (status: MotionStatus) => void;
  /**
   * Change it when the app itself changes the scene, e.g. the screensaver dims the screen: in a
   * dark room the camera sees that as movement. Detection takes a new reference frame and
   * skips the warm-up frames again.
   */
  referenceKey?: unknown;
}

const THROTTLE_INTERVAL = 2000; // Minimum 2s entre détections
const CAPTURE_INTERVAL = 1000; // Capturer une photo par seconde
const CAMERA_READY_DELAY = 1500; // Delay before starting detection to let camera initialize and auto-expose
const CAMERA2_CAPTURE_INTERVAL = 2000; // Camera2 fallback is slower (opens/closes camera each time), use 2s interval
const WARMUP_FRAMES = 3; // Skip first N frames to let camera auto-exposure adjust
// Camera taken by another app (#301): wait before each reopen attempt, the last delay repeats
const RECOVERY_DELAYS = [2000, 5000, 15000, 30000, 60000];
const RECOVERY_RETURN_DELAY = 500; // after the app comes back to the foreground
const RECOVERY_REOPEN_PAUSE = 500; // camera held inactive between the close and the reopen

// Seuils de sensibilité : ratio de pixels qui doivent changer
const SENSITIVITY_THRESHOLDS = {
  low: 0.15,    // 15% de changement
  medium: 0.08, // 8% de changement
  high: 0.04,   // 4% de changement
};

const MotionDetector: React.FC<MotionDetectorProps> = ({
  enabled,
  onMotionDetected,
  sensitivity,
  cameraPosition = 'front',
  requireFace = false,
  onStatusChange,
  referenceKey,
}) => {
  const device = useCameraDevice(cameraPosition);
  const { hasPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const lastMotionTime = useRef<number>(0);
  const detectionInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  // #198 — pending CAMERA_READY_DELAY startup timer. Tracked so stopDetection() can
  // cancel it; otherwise a disable/restart within the delay window leaves it pending
  // and it spins up an orphaned interval with a stale `enabled` closure.
  const startDelayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef<boolean>(true);
  const isCapturing = useRef<boolean>(false);
  const warmupFrames = useRef<number>(0);
  const captureCount = useRef<number>(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  // The parent passes a new callback on every render. Read through a ref so a new one does not
  // restart detection (native reset + warm-up, ~4.5 s blind each time the screensaver came on).
  const onMotionDetectedRef = useRef(onMotionDetected);
  onMotionDetectedRef.current = onMotionDetected;

  // A new referenceKey: new reference frame, warm-up again, detection keeps running
  const referenceKeyRef = useRef(referenceKey);
  useEffect(() => {
    if (Object.is(referenceKeyRef.current, referenceKey)) return;
    referenceKeyRef.current = referenceKey;
    warmupFrames.current = 0;
    MotionDetectionModule?.reset().catch(() => {});
  }, [referenceKey]);

  // #301 — recovery after another app took the camera. CameraX closes the session and never
  // reopens it by itself; only an isActive false -> true cycle does.
  const wantActive = useRef<boolean>(false); // the camera is supposed to be open
  const cameraLost = useRef<boolean>(false);
  const recoveryAttempt = useRef<number>(0);
  const recoveryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reopenTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera2 fallback state — for devices where CameraX/vision-camera fails
  // (e.g. MediaTek LEGACY front-only cameras where CameraValidator rejects the device)
  const [useCamera2Fallback, setUseCamera2Fallback] = useState(false);
  const camera2CheckDone = useRef<boolean>(false);

  // Track mounted state
  useEffect(() => {
    isMounted.current = true;
    console.log(`[MotionDetection] Initializing with ${cameraPosition} camera`);
    return () => {
      isMounted.current = false;
      console.log('[MotionDetection] Component unmounted');
    };
  }, [cameraPosition]);

  // Camera2 fallback check — when vision-camera can't find a device, check Camera2 API directly
  useEffect(() => {
    if (!enabled || device || !hasPermission || camera2CheckDone.current) {
      return;
    }

    // vision-camera returned no device — try Camera2 API fallback
    let cancelled = false;
    camera2CheckDone.current = true;

    (async () => {
      try {
        console.log('[MotionDetection] vision-camera has no device, checking Camera2 fallback...');
        const camera2Devices = await httpServer.getCamera2Devices();
        if (cancelled || !isMounted.current) return;

        const hasTargetCamera = camera2Devices.some(
          (d) => d.position === cameraPosition
        );
        const hasAnyCamera = camera2Devices.length > 0;

        if (hasTargetCamera || hasAnyCamera) {
          console.log(`[MotionDetection] Camera2 fallback: found ${camera2Devices.length} cameras, enabling fallback mode`);
          setUseCamera2Fallback(true);
        } else {
          console.warn('[MotionDetection] Camera2 fallback: no cameras found either');
        }
      } catch (error) {
        console.error('[MotionDetection] Camera2 fallback check failed:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, device, hasPermission, cameraPosition]);

  // Reset Camera2 check when device becomes available (e.g. CameraX finally resolves)
  useEffect(() => {
    if (device) {
      camera2CheckDone.current = false;
      setUseCamera2Fallback(false);
    }
  }, [device]);

  const clearRecovery = useCallback(() => {
    if (recoveryTimeout.current) {
      clearTimeout(recoveryTimeout.current);
      recoveryTimeout.current = null;
    }
    if (reopenTimeout.current) {
      clearTimeout(reopenTimeout.current);
      reopenTimeout.current = null;
    }
    recoveryAttempt.current = 0;
  }, []);

  useEffect(() => clearRecovery, [clearRecovery]);

  const stopDetection = useCallback(() => {
    if (startDelayTimeout.current) {
      clearTimeout(startDelayTimeout.current);
      startDelayTimeout.current = null;
    }
    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
      detectionInterval.current = null;
    }
    isCapturing.current = false;
    warmupFrames.current = 0;
    captureCount.current = 0;
    // Reset native module
    MotionDetectionModule?.reset().catch(() => {});
  }, []);

  // Reopen a lost camera. Only runs in the foreground (a background app must not take the
  // camera from the app the person just opened) and repeats until onStarted clears the loss.
  const scheduleRecovery = useCallback((delay?: number) => {
    if (recoveryTimeout.current || reopenTimeout.current) return;
    if (!wantActive.current || AppState.currentState !== 'active') return;

    const wait = delay ?? RECOVERY_DELAYS[Math.min(recoveryAttempt.current, RECOVERY_DELAYS.length - 1)];
    recoveryTimeout.current = setTimeout(() => {
      recoveryTimeout.current = null;
      if (!isMounted.current || !wantActive.current || !cameraLost.current) return;
      if (AppState.currentState !== 'active') return;

      recoveryAttempt.current += 1;
      console.log(`[MotionDetection] Reopening the camera (attempt ${recoveryAttempt.current})`);
      setIsCameraActive(false);
      reopenTimeout.current = setTimeout(() => {
        reopenTimeout.current = null;
        if (!isMounted.current || !wantActive.current) return;
        setIsCameraActive(true);
        scheduleRecovery(); // checks again, unless the camera comes back first
      }, RECOVERY_REOPEN_PAUSE);
    }, wait);
  }, []);

  const markCameraLost = useCallback(() => {
    if (!wantActive.current) return;
    cameraLost.current = true;
    setIsCameraReady(false);
    stopDetection();
    scheduleRecovery();
  }, [stopDetection, scheduleRecovery]);

  // Back in the foreground: try again at once instead of waiting out a long delay
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (cameraLost.current && !reopenTimeout.current) {
          if (recoveryTimeout.current) {
            clearTimeout(recoveryTimeout.current);
            recoveryTimeout.current = null;
          }
          recoveryAttempt.current = 0;
          scheduleRecovery(RECOVERY_RETURN_DELAY);
        }
      } else if (recoveryTimeout.current) {
        clearTimeout(recoveryTimeout.current);
        recoveryTimeout.current = null;
      }
    });
    return () => subscription.remove();
  }, [scheduleRecovery]);

  // Camera2 fallback capture — uses Camera2 API via HttpServerModule
  const captureAndCompareCamera2 = useCallback(async () => {
    if (!isMounted.current || !enabled || isCapturing.current) {
      return;
    }

    isCapturing.current = true;

    try {
      const photoPath = await httpServer.captureCamera2Photo(cameraPosition, 50);

      if (!isMounted.current || !enabled) return;

      if (!photoPath) {
        console.warn('[MotionDetection] Camera2 fallback: capture returned null');
        return;
      }

      captureCount.current += 1;

      // Warm-up frames only build the native reference and must not open the face window
      const isWarmup = warmupFrames.current < WARMUP_FRAMES;
      if (isWarmup) {
        warmupFrames.current += 1;
        console.log(`[MotionDetection] Camera2 warmup frame ${warmupFrames.current}/${WARMUP_FRAMES}`);
      }
      const hasMotion = await MotionDetectionModule.compareImages(
        photoPath,
        SENSITIVITY_THRESHOLDS[sensitivity],
        requireFace && !isWarmup
      );
      if (isWarmup) return;

      if (captureCount.current % 10 === 0) {
        console.log(`[MotionDetection] Camera2 capture #${captureCount.current}, hasMotion=${hasMotion}`);
      }

      if (!isMounted.current || !enabled) return;

      if (hasMotion) {
        console.log('[MotionDetection] Camera2 fallback: Motion detected!');
        const now = Date.now();
        if (now - lastMotionTime.current > THROTTLE_INTERVAL) {
          lastMotionTime.current = now;
          onMotionDetectedRef.current();
        }
      }
    } catch (error: any) {
      if (error?.message) {
        console.warn(`[MotionDetection] Camera2 capture error: ${error.message}`);
      }
    } finally {
      isCapturing.current = false;
    }
  }, [enabled, sensitivity, requireFace, cameraPosition]);

  const captureAndCompare = useCallback(async () => {
    // Guard against multiple concurrent captures and unmounted state
    if (!isMounted.current || !enabled || isCapturing.current || !isCameraReady) {
      return;
    }

    // Check if camera ref exists and is valid
    const camera = cameraRef.current;
    if (!camera) {
      console.warn('[MotionDetection] Camera ref is null, skipping capture');
      return;
    }

    isCapturing.current = true;

    try {
      const photo = await camera.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });

      // Check if still mounted after async operation
      if (!isMounted.current || !enabled) {
        return;
      }

      if (!photo || !photo.path) {
        console.warn('[MotionDetection] Photo capture returned no path');
        return;
      }

      captureCount.current += 1;

      // Warm-up frames let the camera's auto-exposure adjust (critical when screen
      // brightness is 0). They still go to native to build up the "previous" frame, but
      // their result is ignored and they must not open the face window.
      const isWarmup = warmupFrames.current < WARMUP_FRAMES;
      if (isWarmup) {
        warmupFrames.current += 1;
        console.log(`[MotionDetection] Warmup frame ${warmupFrames.current}/${WARMUP_FRAMES}, skipping comparison`);
      }
      const hasMotion = await MotionDetectionModule.compareImages(
        photo.path,
        SENSITIVITY_THRESHOLDS[sensitivity],
        requireFace && !isWarmup
      );
      if (isWarmup) return;

      // Log periodically (every 10 captures) to avoid log spam
      if (captureCount.current % 10 === 0) {
        console.log(`[MotionDetection] Capture #${captureCount.current}, hasMotion=${hasMotion}, sensitivity=${sensitivity}, threshold=${SENSITIVITY_THRESHOLDS[sensitivity]}`);
      }

      // Check again after async operation
      if (!isMounted.current || !enabled) {
        return;
      }

      if (hasMotion) {
        console.log('[MotionDetection] Motion detected! Triggering callback');
        const now = Date.now();
        if (now - lastMotionTime.current > THROTTLE_INTERVAL) {
          lastMotionTime.current = now;
          onMotionDetectedRef.current();
        } else {
          console.log('[MotionDetection] Motion throttled (too soon after last detection)');
        }
      }
    } catch (error: any) {
      // Log the error for debugging - but don't crash
      // findCameraView errors happen when camera is unmounted during capture
      if (error?.message && !error.message.includes('findCameraView')) {
        console.warn(`[MotionDetection] Capture error: ${error.message}`);
      }
    } finally {
      isCapturing.current = false;
    }
  }, [enabled, sensitivity, requireFace, isCameraReady]);

  // Start detection in Camera2 fallback mode
  const startCamera2Detection = useCallback(() => {
    stopDetection();

    console.log('[MotionDetection] Starting Camera2 fallback detection');
    onStatusChange?.('active');

    // Slightly longer delay for Camera2 — first capture includes camera open time
    startDelayTimeout.current = setTimeout(() => {
      startDelayTimeout.current = null;
      if (!isMounted.current || !enabled) return;

      detectionInterval.current = setInterval(() => {
        if (isMounted.current && enabled) {
          captureAndCompareCamera2();
        }
      }, CAMERA2_CAPTURE_INTERVAL);
    }, CAMERA_READY_DELAY);
  }, [stopDetection, captureAndCompareCamera2, enabled, onStatusChange]);

  const startDetection = useCallback(() => {
    stopDetection();

    // Add a small delay to ensure camera is fully initialized
    startDelayTimeout.current = setTimeout(() => {
      startDelayTimeout.current = null;
      if (!isMounted.current || !enabled) return;

      detectionInterval.current = setInterval(() => {
        if (isMounted.current && enabled && isCameraReady) {
          captureAndCompare();
        }
      }, CAPTURE_INTERVAL);
    }, CAMERA_READY_DELAY);
  }, [stopDetection, captureAndCompare, enabled, isCameraReady]);

  // Camera2 fallback detection lifecycle
  useEffect(() => {
    if (useCamera2Fallback && enabled && hasPermission) {
      startCamera2Detection();
    }
    return () => {
      if (useCamera2Fallback) {
        stopDetection();
      }
    };
  }, [useCamera2Fallback, enabled, hasPermission, startCamera2Detection, stopDetection]);

  // Vision-camera lifecycle (original)
  useEffect(() => {
    if (enabled && hasPermission && device && !useCamera2Fallback) {
      wantActive.current = true;
      setIsCameraActive(true);
    } else {
      wantActive.current = false;
      cameraLost.current = false;
      clearRecovery();
      setIsCameraActive(false);
      setIsCameraReady(false);
      if (!useCamera2Fallback) {
        stopDetection();
      }
    }

    return () => {
      if (!useCamera2Fallback) {
        stopDetection();
      }
    };
  }, [enabled, hasPermission, device, useCamera2Fallback, stopDetection, clearRecovery]);

  // Start detection only when camera is ready (vision-camera mode)
  useEffect(() => {
    if (isCameraReady && enabled && hasPermission && !useCamera2Fallback) {
      startDetection();
    }
    return () => {
      if (!useCamera2Fallback) {
        stopDetection();
      }
    };
  }, [isCameraReady, enabled, hasPermission, useCamera2Fallback, startDetection, stopDetection]);

  const handleCameraInitialized = useCallback(() => {
    if (isMounted.current) {
      console.log(`[MotionDetection] Camera initialized successfully (${cameraPosition})`);
      setIsCameraReady(true);
      onStatusChange?.('active');
    }
  }, [cameraPosition, onStatusChange]);

  const handleCameraError = useCallback((error: any) => {
    console.error(`[MotionDetection] Camera error (${cameraPosition}):`, error);
    setIsCameraReady(false);
    stopDetection();
    onStatusChange?.('error');
    markCameraLost();
  }, [cameraPosition, stopDetection, onStatusChange, markCameraLost]);

  // The session closed while we want it open: another app took the camera (#301).
  // The cycle that reopens it does not call onInitialized again, so onStarted brings it back.
  const handleCameraStopped = useCallback(() => {
    if (!isMounted.current || !wantActive.current || cameraLost.current) return;
    console.warn(`[MotionDetection] Camera stopped (${cameraPosition}), another app may have taken it`);
    onStatusChange?.('error');
    markCameraLost();
  }, [cameraPosition, onStatusChange, markCameraLost]);

  const handleCameraStarted = useCallback(() => {
    if (!isMounted.current || !cameraLost.current) return;
    console.log(`[MotionDetection] Camera is back (${cameraPosition})`);
    cameraLost.current = false;
    clearRecovery();
    setIsCameraReady(true);
    onStatusChange?.('active');
  }, [cameraPosition, onStatusChange, clearRecovery]);

  // Check if camera is available and notify status
  useEffect(() => {
    if (!device && enabled && !useCamera2Fallback) {
      console.warn(`[MotionDetection] No ${cameraPosition} camera available on this device`);
      onStatusChange?.('no-camera');
    } else if (!enabled) {
      onStatusChange?.('idle');
    }
  }, [device, enabled, cameraPosition, useCamera2Fallback, onStatusChange]);

  // Camera2 fallback mode — no vision-camera component needed, just run detection
  if (useCamera2Fallback && enabled && hasPermission) {
    // Return an empty View — Camera2 captures are done via native module, no UI component needed
    return <View style={styles.container} pointerEvents="none" />;
  }

  if (!enabled || !device || !hasPermission) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={isCameraActive}
        photo={true}
        lowLightBoost={device.supportsLowLightBoost}
        onInitialized={handleCameraInitialized}
        onStarted={handleCameraStarted}
        onStopped={handleCameraStopped}
        onError={handleCameraError}
        enableZoomGesture={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // Use off-screen positioning instead of opacity:0 which can prevent
    // camera capture on some Android devices
    left: -1000,
    top: -1000,
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
  camera: {
    width: 320,
    height: 240,
  },
});

export default MotionDetector;
