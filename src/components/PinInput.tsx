import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { verifySecurePin, getLockoutStatus, hasSecurePin } from '../utils/secureStorage';
import { StorageService } from '../utils/storage';

interface PinInputProps {
  onSuccess: () => void;
  storedPin: string; // Kept for backward compatibility but not used
}

const PinInput: React.FC<PinInputProps> = ({ onSuccess }) => {
  const [pin, setPin] = useState<string>('');
  const [displayValue, setDisplayValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState<number>(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(5);
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean>(false);
  const [pinMode, setPinMode] = useState<'numeric' | 'alphanumeric'>('numeric');
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkLockoutStatus();
    checkPinConfiguration();
    loadPinMode();
    const interval = setInterval(checkLockoutStatus, 1000);
    return () => {
      clearInterval(interval);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Handle PIN masking with last character visible temporarily
  const handlePinChange = (text: string): void => {
    // Clear any pending timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    // The text we receive contains masked characters (•) and possibly new characters
    // We need to reconstruct the real PIN
    const currentPinLength = pin.length;
    const newTextLength = text.length;

    let newPin: string;

    if (newTextLength > currentPinLength) {
      // User typed new character(s) - append them to real PIN
      const newChars = text.slice(currentPinLength);
      newPin = pin + newChars;
    } else if (newTextLength < currentPinLength) {
      // User deleted character(s) - truncate real PIN
      newPin = pin.slice(0, newTextLength);
    } else {
      // Same length - no change
      newPin = pin;
    }

    setPin(newPin);

    if (newPin.length === 0) {
      setDisplayValue('');
      return;
    }

    // Show masked value with last character visible
    const masked = '•'.repeat(Math.max(0, newPin.length - 1)) + newPin.slice(-1);
    setDisplayValue(masked);

    // After 500ms, mask the last character too
    hideTimeoutRef.current = setTimeout(() => {
      setDisplayValue('•'.repeat(newPin.length));
    }, 500);
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
        '🔒 Locked Out',
        `Too many failed attempts.\n\nTry again in ${Math.ceil(lockoutTimeRemaining / 60000)} minutes.`
      );
      return;
    }

    if (pin.length < 4) {
      Alert.alert('Error', 'Password must be at least 4 characters');
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
            '🔒 Too Many Failed Attempts',
            result.message || 'Account locked for 15 minutes',
            [{ text: 'OK' }]
          );
        } else {
          setAttemptsRemaining(result.attemptsRemaining || 0);
          Alert.alert(
            '❌ Incorrect PIN',
            `${result.attemptsRemaining || 0} attempts remaining`,
            [{ text: 'Try Again' }]
          );
        }
      }
    } catch (error) {
      console.error('[PinInput] Error verifying PIN:', error);
      Alert.alert('Error', 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (milliseconds: number): string => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{pinMode === 'alphanumeric' ? 'Enter Password' : 'Enter PIN Code'}</Text>

      {isLockedOut ? (
        <>
          <View style={styles.lockoutContainer}>
            <Text style={styles.lockoutIcon}>🔒</Text>
            <Text style={styles.lockoutTitle}>Account Locked</Text>
            <Text style={styles.lockoutText}>
              Too many failed attempts
            </Text>
            <Text style={styles.lockoutTimer}>
              Retry in: {formatTime(lockoutTimeRemaining)}
            </Text>
          </View>
        </>
      ) : (
        <>
          {!hasPinConfigured && (
            <Text style={styles.subtitle}>Default code: 1234</Text>
          )}

          {attemptsRemaining < 5 && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                ⚠️ {attemptsRemaining} attempts remaining
              </Text>
            </View>
          )}

          <TextInput
            style={[styles.input, isLoading && styles.inputDisabled]}
            value={displayValue}
            onChangeText={handlePinChange}
            keyboardType={pinMode === 'alphanumeric' ? 'default' : 'numeric'}
            maxLength={pinMode === 'alphanumeric' ? undefined : 6}
            placeholder={pinMode === 'alphanumeric' ? 'Enter password' : '••••'}
            autoFocus
            autoCapitalize={pinMode === 'alphanumeric' ? 'none' : undefined}
            autoCorrect={false}
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
              <Text style={styles.buttonText}>Validate</Text>
            )}
          </TouchableOpacity>
        </>
      )}
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
    borderColor: '#0066cc',
    borderRadius: 8,
    paddingHorizontal: 20,
    fontSize: 24,
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
    backgroundColor: '#0066cc',
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
});

export default PinInput;
