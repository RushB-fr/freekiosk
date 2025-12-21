import React, { useRef, useEffect, useState } from 'react';
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
  const detectionInterval = useRef<any>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  useEffect(() => {
    if (enabled && hasPermission) {
      setIsCameraActive(true);
      startDetection();
    } else {
      setIsCameraActive(false);
      stopDetection();
    }

    return () => {
      stopDetection();
    };
  }, [enabled, hasPermission, sensitivity]);

  const startDetection = () => {
    stopDetection();

    detectionInterval.current = setInterval(async () => {
      await captureAndCompare();
    }, CAPTURE_INTERVAL);
  };

  const stopDetection = () => {
    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
      detectionInterval.current = null;
    }
    // Reset native module
    MotionDetectionModule?.reset().catch(() => {});
  };

  const captureAndCompare = async () => {
    if (!cameraRef.current || !enabled) return;

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });

      if (!photo || !photo.path) {
        return;
      }

      // Use native module for pixel comparison
      const hasMotion = await MotionDetectionModule.compareImages(
        photo.path,
        SENSITIVITY_THRESHOLDS[sensitivity]
      );

      if (hasMotion) {
        handleMotionDetected();
      }
    } catch (error) {
      // Silent capture errors
    }
  };

  const handleMotionDetected = () => {
    const now = Date.now();
    if (now - lastMotionTime.current > THROTTLE_INTERVAL) {
      lastMotionTime.current = now;
      onMotionDetected();
    }
  };

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
