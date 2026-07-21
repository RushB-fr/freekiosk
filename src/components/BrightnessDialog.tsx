import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import BrightnessModule from '../utils/BrightnessModule';
import { StorageService } from '../utils/storage';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function BrightnessDialog({ visible, onClose }: Props) {
  const [brightness, setBrightness] = useState(0.5);
  const lastPersisted = useRef(0.5);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const current = await BrightnessModule.getBrightnessLevel();
        if (!cancelled) {
          setBrightness(current);
          lastPersisted.current = current;
        }
      } catch (e) {
        console.warn('[BrightnessDialog] getBrightnessLevel error:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const applyBrightness = async (value: number) => {
    setBrightness(value);
    try {
      await BrightnessModule.setBrightnessLevel(value);
    } catch (e) {
      console.warn('[BrightnessDialog] setBrightnessLevel error:', e);
    }
  };

  const persistBrightness = async (value: number) => {
    if (Math.abs(value - lastPersisted.current) < 0.01) return;
    lastPersisted.current = value;
    try {
      await StorageService.saveDefaultBrightness(value);
    } catch (e) {
      console.warn('[BrightnessDialog] saveDefaultBrightness error:', e);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <Text style={styles.title}>Screen Brightness</Text>
          <Text style={styles.value}>{Math.round(brightness * 100)}%</Text>

          <Slider
            value={brightness}
            minimumValue={0.05}
            maximumValue={1}
            step={0.01}
            minimumTrackTintColor="#0066cc"
            maximumTrackTintColor="#d0d0d0"
            thumbTintColor="#0066cc"
            onValueChange={applyBrightness}
            onSlidingComplete={persistBrightness}
          />

          <View style={styles.presets}>
            {[0.2, 0.5, 0.8, 1].map((preset) => (
              <TouchableOpacity
                key={preset}
                style={styles.presetBtn}
                onPress={async () => {
                  await applyBrightness(preset);
                  await persistBrightness(preset);
                }}
              >
                <Text style={styles.presetText}>{Math.round(preset * 100)}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    elevation: 8,
  },
  title: {
    color: '#222',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  value: {
    color: '#0066cc',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  presets: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f6fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe4ef',
  },
  presetText: {
    color: '#35516e',
    fontSize: 13,
    fontWeight: '700',
  },
});
