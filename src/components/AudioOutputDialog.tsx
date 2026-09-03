import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon, { IconName } from './Icon';
import { Colors } from '../theme';

const { AudioControlModule } = NativeModules;

const OUTPUT_ICONS: Record<string, IconName> = {
  auto: 'volume-high',
  speaker: 'volume-high',
  speaker_forced: 'volume-high',
  wired_headphones: 'headphones',
  wired_headset: 'headphones',
  usb_headset: 'headphones',
  hdmi: 'television',
  bluetooth_a2dp: 'bluetooth',
  bluetooth_sco: 'microphone',
};

interface AudioOutput {
  id: string;
  label: string;
  type: string;
}

interface AudioInfo {
  isMuted: boolean;
  currentOutput: string;
  availableOutputs: AudioOutput[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function AudioOutputDialog({ visible, onClose }: Props) {
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshAudio = useCallback(async () => {
    if (!AudioControlModule) return;
    setIsLoading(true);
    try {
      const info: AudioInfo = await AudioControlModule.getAudioInfo();
      setAudioInfo(info);
    } catch (e) {
      console.warn('[AudioOutputDialog] getAudioInfo error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) refreshAudio();
  }, [visible, refreshAudio]);

  const handleSelectOutput = async (output: AudioOutput) => {
    try {
      await AudioControlModule.setAudioOutput(output.id);
      onClose();
    } catch (e) {
      console.warn('[AudioOutputDialog] setAudioOutput error:', e);
    }
  };

  const handleMuteToggle = async () => {
    if (!audioInfo) return;
    try {
      await AudioControlModule.setMuted(!audioInfo.isMuted);
      await refreshAudio();
    } catch (e) {
      console.warn('[AudioOutputDialog] setMuted error:', e);
    }
  };

  const outputs = audioInfo?.availableOutputs ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1}>
          <Text style={styles.title}>Audio Output</Text>

          {isLoading && !audioInfo ? (
            <ActivityIndicator color="#2b7fff" />
          ) : (
            <>
              {outputs.map((out) => {
                const isActive = out.type === audioInfo?.currentOutput || out.id === audioInfo?.currentOutput;
                return (
                  <TouchableOpacity
                    key={`${out.id}-${out.label}`}
                    style={[styles.row, isActive && styles.rowActive]}
                    onPress={() => handleSelectOutput(out)}
                  >
                    <View style={styles.rowIcon}>
                      <Icon name={OUTPUT_ICONS[out.type] ?? 'volume-high'} size={22} color={isActive ? Colors.primaryDark : Colors.textSecondary} />
                    </View>
                    <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{out.label}</Text>
                    {isActive && <Icon name="check" size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}

              {outputs.length === 0 && (
                <Text style={styles.empty}>No selectable outputs found</Text>
              )}

              <TouchableOpacity style={styles.muteButton} onPress={handleMuteToggle}>
                <Icon name={audioInfo?.isMuted ? 'volume-off' : 'volume-high'} size={20} color="#fff" style={styles.muteIcon} />
                <Text style={styles.muteLabel}>{audioInfo?.isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>
            </>
          )}
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
    borderRadius: 16,
    padding: 16,
    elevation: 8,
  },
  title: {
    color: '#222',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f5',
    backgroundColor: '#f8faff',
  },
  rowActive: {
    borderColor: '#2b7fff',
    backgroundColor: '#e8f1ff',
  },
  rowIcon: {
    width: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  rowLabelActive: {
    color: '#004f9e',
  },
  check: {
    color: '#2b7fff',
    fontSize: 18,
    fontWeight: '700',
  },
  empty: {
    color: '#666',
    fontSize: 14,
    paddingVertical: 12,
    textAlign: 'center',
  },
  muteButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1b2a4d',
    marginTop: 4,
    paddingHorizontal: 12,
  },
  muteIcon: {
    marginRight: 8,
  },
  muteLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
