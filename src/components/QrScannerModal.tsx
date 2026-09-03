/**
 * FreeKiosk - QR scanner modal
 * Full-screen camera modal that reads a QR code and returns its raw string value.
 * Used by the cloud enrollment flow to scan the token QR shown on the dashboard.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';

interface QrScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (value: string) => void;
}

const QrScannerModal: React.FC<QrScannerModalProps> = ({ visible, onClose, onScanned }) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  // Guard so a single QR isn't reported repeatedly across frames.
  const handledRef = useRef(false);

  useEffect(() => {
    if (visible) {
      handledRef.current = false;
      if (!hasPermission) {
        requestPermission();
      }
    }
  }, [visible, hasPermission, requestPermission]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: useCallback(
      (codes: { value?: string }[]) => {
        if (handledRef.current) return;
        const value = codes.find(c => c.value)?.value;
        if (value) {
          handledRef.current = true;
          onScanned(value);
        }
      },
      [onScanned],
    ),
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        {device && hasPermission ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={visible}
            codeScanner={codeScanner}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.message}>
              {hasPermission
                ? 'No camera available on this device.'
                : 'Camera permission is required to scan the QR code.'}
            </Text>
          </View>
        )}

        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>
            Point the camera at the enrollment QR code on the cloud dashboard
          </Text>
        </View>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { color: '#fff', fontSize: 16, textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 32,
  },
  cancelBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default QrScannerModal;
