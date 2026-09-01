import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, NativeModules } from 'react-native';
import { verifySecurePin, getLockoutStatus, hasSecurePin } from '../utils/secureStorage';
import { StorageService } from '../utils/storage';
import WifiDialog from './WifiDialog';
import BluetoothDialog from './BluetoothDialog';
import AudioOutputDialog from './AudioOutputDialog';
import BrightnessDialog from './BrightnessDialog';
import Icon from './Icon';
import { Colors } from '../theme';
import { useTranslation } from 'react-i18next';

const { KioskModule, AudioControlModule, FlashlightModule, RotationControlModule } = NativeModules;

interface PinInputProps {
  onSuccess: () => void;
  storedPin: string; // Kept for backward compatibility but not used
}

const PinInput: React.FC<PinInputProps> = ({ onSuccess }) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState<number>(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(5);
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean>(false);
  const [pinMode, setPinMode] = useState<'numeric' | 'alphanumeric'>('numeric');
  const inputRef = useRef<TextInput>(null);
  const [showWifiButton, setShowWifiButton] = useState(false);
  const [showBluetoothButton, setShowBluetoothButton] = useState(false);
  const [showAudioControls, setShowAudioControls] = useState(false);
  const [showEmergencyButton, setShowEmergencyButton] = useState(false);
  const [showFlashlightButton, setShowFlashlightButton] = useState(false);
  const [showBrightnessButton, setShowBrightnessButton] = useState(false);
  const [showRotationLockButton, setShowRotationLockButton] = useState(false);
  const [wifiDialogVisible, setWifiDialogVisible] = useState(false);
  const [bluetoothDialogVisible, setBluetoothDialogVisible] = useState(false);
  const [audioDialogVisible, setAudioDialogVisible] = useState(false);
  const [brightnessDialogVisible, setBrightnessDialogVisible] = useState(false);
  const [flashlightAvailable, setFlashlightAvailable] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [flashlightBusy, setFlashlightBusy] = useState(false);
  const [rotationLockAvailable, setRotationLockAvailable] = useState(false);
  const [rotationLocked, setRotationLocked] = useState(false);
  const [rotationBusy, setRotationBusy] = useState(false);

  useEffect(() => {
    checkLockoutStatus();
    checkPinConfiguration();
    loadPinMode();
    loadLockscreenSettings();
    const interval = setInterval(checkLockoutStatus, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const loadLockscreenSettings = async (): Promise<void> => {
    const [controlsEnabled, wifi, bluetooth, audio, emergency, flashlight, brightness, rotationLock] = await Promise.all([
      StorageService.getLockscreenControlsEnabled(),
      StorageService.getLockscreenWifiEnabled(),
      StorageService.getLockscreenBluetoothEnabled(),
      StorageService.getLockscreenAudioEnabled(),
      StorageService.getLockscreenEmergencyCallEnabled(),
      StorageService.getLockscreenFlashlightEnabled(),
      StorageService.getLockscreenBrightnessEnabled(),
      StorageService.getLockscreenRotationLockEnabled(),
    ]);

    setShowWifiButton(controlsEnabled && wifi);
    setShowBluetoothButton(controlsEnabled && bluetooth);
    setShowAudioControls(controlsEnabled && audio);
    setShowEmergencyButton(controlsEnabled && emergency);
    setShowFlashlightButton(controlsEnabled && flashlight);
    setShowBrightnessButton(controlsEnabled && brightness);
    setShowRotationLockButton(controlsEnabled && rotationLock);

    if (controlsEnabled && flashlight && FlashlightModule?.isAvailable) {
      try {
        const available = await FlashlightModule.isAvailable();
        setFlashlightAvailable(Boolean(available));
        if (available && FlashlightModule?.getState) {
          const enabled = await FlashlightModule.getState();
          setFlashlightOn(Boolean(enabled));
        }
      } catch (e) {
        console.warn('[PinInput] flashlight availability error:', e);
        setFlashlightAvailable(false);
      }
    }

    if (controlsEnabled && rotationLock && RotationControlModule?.isAvailable) {
      try {
        const available = await RotationControlModule.isAvailable();
        setRotationLockAvailable(Boolean(available));
        if (available && RotationControlModule?.getState) {
          const state = await RotationControlModule.getState();
          setRotationLocked(Boolean(state?.locked));
        }
      } catch (e) {
        console.warn('[PinInput] rotation availability error:', e);
        setRotationLockAvailable(false);
      }
    }
  };

  const handlePinChange = (text: string): void => {
    if (pinMode === 'numeric') {
      const filtered = text.replace(/[^0-9]/g, '');
      setPin(filtered);
    } else {
      setPin(text);
    }
  };

  const loadPinMode = async (): Promise<void> => {
    const mode = await StorageService.getPinMode();
    setPinMode(mode);
  };

  const checkPinConfiguration = async (): Promise<void> => {
    const isPinConfigured = await hasSecurePin();
    setHasPinConfigured(isPinConfigured);
  };

  const checkLockoutStatus = async (): Promise<void> => {
    const status = await getLockoutStatus();
    setIsLockedOut(status.isLockedOut);
    setLockoutTimeRemaining(status.timeRemaining || 0);
    setAttemptsRemaining(status.attemptsRemaining);
  };

  const handleSubmit = async (): Promise<void> => {
    if (isLockedOut) {
      Alert.alert(
        t('components.pinInput.lockedOutTitle'),
        t('components.pinInput.lockedOutMessage', { minutes: Math.ceil(lockoutTimeRemaining / 60000) })
      );
      return;
    }

    if (pin.length < 4) {
      Alert.alert(t('components.pinInput.error'), t('components.pinInput.passwordMinLength'));
      return;
    }

    setIsLoading(true);

    try {
      const result = await verifySecurePin(pin);

      if (result.success) {
        setPin('');
        onSuccess();
      } else {
        setPin('');

        if (result.lockoutTimeRemaining) {
          setIsLockedOut(true);
          setLockoutTimeRemaining(result.lockoutTimeRemaining);
          Alert.alert(
            t('components.pinInput.tooManyFailedTitle'),
            result.message || t('components.pinInput.accountLockedDefault'),
            [{ text: t('components.pinInput.ok') }]
          );
        } else {
          setAttemptsRemaining(result.attemptsRemaining || 0);
          Alert.alert(
            t('components.pinInput.incorrectPin'),
            t('components.pinInput.attemptsRemaining', { count: result.attemptsRemaining || 0 }),
            [{ text: t('components.pinInput.tryAgain') }]
          );
        }
      }
    } catch (error) {
      console.error('[PinInput] Error verifying PIN:', error);
      Alert.alert(t('components.pinInput.error'), t('components.pinInput.genericError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyCall = async (): Promise<void> => {
    try {
      await KioskModule.launchEmergencyDial();
    } catch (e) {
      console.warn('[PinInput] launchEmergencyDial error:', e);
      Alert.alert(t('components.pinInput.emergencyCallTitle'), t('components.pinInput.emergencyCallError'));
    }
  };

  const handleAudioPress = async (): Promise<void> => {
    try {
      if (AudioControlModule?.showSystemOutputSwitcher) {
        const shown = await AudioControlModule.showSystemOutputSwitcher();
        if (shown) {
          return;
        }
      }
    } catch (e) {
      console.warn('[PinInput] showSystemOutputSwitcher error:', e);
    }

    setAudioDialogVisible(true);
  };

  const handleFlashlightPress = async (): Promise<void> => {
    if (!FlashlightModule?.setEnabled || flashlightBusy) {
      return;
    }

    const next = !flashlightOn;
    setFlashlightBusy(true);
    setFlashlightOn(next);
    try {
      const result = await FlashlightModule.setEnabled(next);
      setFlashlightOn(Boolean(result));
    } catch (e) {
      console.warn('[PinInput] flashlight toggle error:', e);
      setFlashlightOn(!next);
      Alert.alert(t('components.pinInput.flashlightTitle'), t('components.pinInput.flashlightError'));
    } finally {
      setFlashlightBusy(false);
    }
  };

  const handleRotationLockPress = async (): Promise<void> => {
    if (rotationBusy) {
      return;
    }

    if (!rotationLockAvailable || !RotationControlModule?.setLocked) {
      Alert.alert(t('components.pinInput.rotationLockTitle'), t('components.pinInput.rotationLockUnavailable'));
      return;
    }

    const next = !rotationLocked;
    setRotationBusy(true);
    setRotationLocked(next);
    try {
      const state = await RotationControlModule.setLocked(next);
      setRotationLocked(Boolean(state?.locked));
    } catch (e) {
      console.warn('[PinInput] rotation toggle error:', e);
      setRotationLocked(!next);
      Alert.alert(t('components.pinInput.rotationLockTitle'), t('components.pinInput.rotationLockError'));
    } finally {
      setRotationBusy(false);
    }
  };

  const formatTime = (milliseconds: number): string => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const hasQuickControls =
    showWifiButton ||
    showBluetoothButton ||
    showAudioControls ||
    showEmergencyButton ||
    (showFlashlightButton && flashlightAvailable) ||
    showBrightnessButton ||
    showRotationLockButton;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{pinMode === 'alphanumeric' ? t('components.pinInput.enterPassword') : t('components.pinInput.enterPinCode')}</Text>

      {isLockedOut ? (
        <>
          <View style={styles.lockoutContainer}>
            <Icon name="lock" size={40} color={Colors.error} style={styles.lockoutIcon} />
            <Text style={styles.lockoutTitle}>{t('components.pinInput.accountLocked')}</Text>
            <Text style={styles.lockoutText}>
              {t('components.pinInput.tooManyFailedAttempts')}
            </Text>
            <Text style={styles.lockoutTimer}>
              {t('components.pinInput.retryIn', { time: formatTime(lockoutTimeRemaining) })}
            </Text>
          </View>
        </>
      ) : (
        <>
          {!hasPinConfigured && (
            <Text style={styles.subtitle}>{t('components.pinInput.defaultCode')}</Text>
          )}

          {attemptsRemaining < 5 && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                {t('components.pinInput.attemptsRemaining', { count: attemptsRemaining })}
              </Text>
            </View>
          )}

          <TextInput
            ref={inputRef}
            style={[styles.input, isLoading && styles.inputDisabled]}
            value={pin}
            onChangeText={handlePinChange}
            secureTextEntry={true}
            keyboardType={pinMode === 'alphanumeric' ? 'default' : 'numeric'}
            maxLength={pinMode === 'alphanumeric' ? undefined : 6}
            placeholder={pinMode === 'alphanumeric' ? t('components.pinInput.passwordPlaceholder') : '••••'}
            placeholderTextColor="#999999"
            autoCapitalize={pinMode === 'alphanumeric' ? 'none' : undefined}
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            editable={!isLoading && !isLockedOut}
          />

          <TouchableOpacity
            style={[styles.button, (isLoading || isLockedOut) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading || isLockedOut}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('components.pinInput.validate')}</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {hasQuickControls && (
        <View style={styles.quickControls}>
          {showWifiButton && (
            <TouchableOpacity style={styles.quickBtn} onPress={() => setWifiDialogVisible(true)}>
              <Icon name="wifi" size={24} color={Colors.primary} style={styles.quickBtnIcon} />
              <Text style={styles.quickBtnLabel}>{t('components.pinInput.wifi')}</Text>
            </TouchableOpacity>
          )}

          {showBluetoothButton && (
            <TouchableOpacity style={styles.quickBtn} onPress={() => setBluetoothDialogVisible(true)}>
              <Icon name="bluetooth" size={24} color={Colors.primary} style={styles.quickBtnIcon} />
              <Text style={styles.quickBtnLabel}>{t('components.pinInput.bluetooth')}</Text>
            </TouchableOpacity>
          )}

          {showAudioControls && (
            <TouchableOpacity style={styles.quickBtn} onPress={handleAudioPress}>
              <Icon name="volume-high" size={24} color={Colors.primary} style={styles.quickBtnIcon} />
              <Text style={styles.quickBtnLabel}>{t('components.pinInput.audio')}</Text>
            </TouchableOpacity>
          )}

          {showFlashlightButton && flashlightAvailable && (
            <TouchableOpacity
              style={[styles.quickBtn, flashlightOn && styles.quickBtnActive]}
              onPress={handleFlashlightPress}
              disabled={flashlightBusy}
            >
              <Icon name="flashlight" size={24} color={flashlightOn ? Colors.textOnPrimary : Colors.primary} style={styles.quickBtnIcon} />
              <Text style={styles.quickBtnLabel}>{flashlightOn ? t('components.pinInput.lightOff') : t('components.pinInput.lightOn')}</Text>
            </TouchableOpacity>
          )}

          {showBrightnessButton && (
            <TouchableOpacity style={styles.quickBtn} onPress={() => setBrightnessDialogVisible(true)}>
              <Icon name="white-balance-sunny" size={24} color={Colors.primary} style={styles.quickBtnIcon} />
              <Text style={styles.quickBtnLabel}>{t('components.pinInput.brightness')}</Text>
            </TouchableOpacity>
          )}

          {showRotationLockButton && (
            <TouchableOpacity
              style={[styles.quickBtn, rotationLocked && styles.quickBtnActive]}
              onPress={handleRotationLockPress}
              disabled={rotationBusy}
            >
              <Icon name="screen-rotation" size={24} color={rotationLocked ? Colors.textOnPrimary : Colors.primary} style={styles.quickBtnIcon} />
              <Text style={styles.quickBtnLabel}>{t('components.pinInput.rotate')}</Text>
            </TouchableOpacity>
          )}

          {showEmergencyButton && (
            <TouchableOpacity style={[styles.quickBtn, styles.emergencyBtn]} onPress={handleEmergencyCall}>
              <Icon name="phone" size={24} color={Colors.error} style={styles.quickBtnIcon} />
              <Text style={[styles.quickBtnLabel, styles.emergencyLabel]}>{t('components.pinInput.emergency')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <WifiDialog visible={wifiDialogVisible} onClose={() => setWifiDialogVisible(false)} />
      <BluetoothDialog visible={bluetoothDialogVisible} onClose={() => setBluetoothDialogVisible(false)} />
      <AudioOutputDialog visible={audioDialogVisible} onClose={() => setAudioDialogVisible(false)} />
      <BrightnessDialog visible={brightnessDialogVisible} onClose={() => setBrightnessDialogVisible(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30,
  },
  input: {
    width: '80%',
    height: 60,
    borderWidth: 2,
    borderColor: '#2b7fff',
    borderRadius: 8,
    paddingHorizontal: 20,
    fontSize: 24,
    color: '#333333',
    backgroundColor: '#fff',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 10,
  },
  inputDisabled: {
    backgroundColor: '#e0e0e0',
    borderColor: '#999',
    opacity: 0.6,
  },
  button: {
    backgroundColor: '#2b7fff',
    paddingHorizontal: 50,
    paddingVertical: 15,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#999',
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  warningContainer: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffc107',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    width: '80%',
  },
  warningText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  lockoutContainer: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '80%',
    borderWidth: 2,
    borderColor: '#dc3545',
  },
  lockoutIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  lockoutTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 10,
  },
  lockoutText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  lockoutTimer: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#dc3545',
    fontFamily: 'monospace',
  },
  quickControls: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    rowGap: 10,
    marginTop: 28,
  },
  quickBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    elevation: 3,
    width: '31%',
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  quickBtnActive: {
    borderColor: '#f0b400',
    backgroundColor: '#fff7d6',
  },
  quickBtnIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  quickBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center',
  },
  emergencyBtn: {
    borderColor: '#dc3545',
    borderWidth: 2,
  },
  emergencyLabel: {
    color: '#dc3545',
  },
});

export default PinInput;
