import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import MotionDetectionModule from '../utils/MotionDetectionModule';

interface MotionDetectorProps {
  enabled: boolean;
  onMotionDetected: () => void;
  sensitivity: 'low' | 'medium' | 'high';
}

const THROTTLE_INTERVAL = 2000; // Minimum 2s entre détections
const CAPTURE_INTERVAL = 1000; // Capturer une photo par seconde
const CAMERA_READY_DELAY = 500; // Delay before starting detection to let camera initialize

// Seuils de sensibilité : ratio de pixels qui doivent changer
const SENSITIVITY_THRESHOLDS = {
  low: 0.15,    // 15% de changement
  medium: 0.08, // 8% de changement
  high: 0.04,   // 4% de changement
};

const MotionDetector: React.FC<MotionDetectorProps> = ({
  enabled,
  onMotionDetected,
  sensitivity
}) => {
  const device = useCameraDevice('front');
  const { hasPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const lastMotionTime = useRef<number>(0);
  const detectionInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef<boolean>(true);
  const isCapturing = useRef<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Track mounted state
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const stopDetection = useCallback(() => {
    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
      detectionInterval.current = null;
    }
    isCapturing.current = false;
    // Reset native module
    MotionDetectionModule?.reset().catch(() => {});
  }, []);

  const captureAndCompare = useCallback(async () => {
    // Guard against multiple concurrent captures and unmounted state
    if (!isMounted.current || !enabled || isCapturing.current || !isCameraReady) {
      return;
    }

    // Check if camera ref exists and is valid
    const camera = cameraRef.current;
    if (!camera) {
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
        return;
      }

      // Use native module for pixel comparison
      const hasMotion = await MotionDetectionModule.compareImages(
        photo.path,
        SENSITIVITY_THRESHOLDS[sensitivity]
      );

      // Check again after async operation
      if (!isMounted.current || !enabled) {
        return;
      }

      if (hasMotion) {
        const now = Date.now();
        if (now - lastMotionTime.current > THROTTLE_INTERVAL) {
          lastMotionTime.current = now;
          onMotionDetected();
        }
      }
    } catch (error) {
      // Silent capture errors - this includes the findCameraView error
      // which happens when camera is unmounted during capture
    } finally {
      isCapturing.current = false;
    }
  }, [enabled, sensitivity, onMotionDetected, isCameraReady]);

  const startDetection = useCallback(() => {
    stopDetection();

    // Add a small delay to ensure camera is fully initialized
    setTimeout(() => {
      if (!isMounted.current || !enabled) return;

      detectionInterval.current = setInterval(() => {
        if (isMounted.current && enabled && isCameraReady) {
          captureAndCompare();
        }
      }, CAPTURE_INTERVAL);
    }, CAMERA_READY_DELAY);
  }, [stopDetection, captureAndCompare, enabled, isCameraReady]);

  useEffect(() => {
    if (enabled && hasPermission && device) {
      setIsCameraActive(true);
    } else {
      setIsCameraActive(false);
      setIsCameraReady(false);
      stopDetection();
    }

    return () => {
      stopDetection();
    };
  }, [enabled, hasPermission, device, stopDetection]);

  // Start detection only when camera is ready
  useEffect(() => {
    if (isCameraReady && enabled && hasPermission) {
      startDetection();
    }
    return () => {
      stopDetection();
    };
  }, [isCameraReady, enabled, hasPermission, startDetection, stopDetection]);

  const handleCameraInitialized = useCallback(() => {
    if (isMounted.current) {
      setIsCameraReady(true);
    }
  }, []);

  const handleCameraError = useCallback((error: any) => {
    // Camera error occurred - stop detection to prevent crashes
    console.warn('Camera error:', error);
    setIsCameraReady(false);
    stopDetection();
  }, [stopDetection]);

  if (!enabled || !device || !hasPermission) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={isCameraActive}
        photo={true}
        onInitialized={handleCameraInitialized}
        onError={handleCameraError}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    zIndex: -1,
    overflow: 'hidden',
  },
  camera: {
    width: 320,
    height: 240,
  },
});

export default MotionDetector;
