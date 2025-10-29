import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import PinInput from '../components/PinInput';
import { StorageService } from '../utils/storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type PinScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Pin'>;

interface PinScreenProps {
  navigation: PinScreenNavigationProp;
}

const PinScreen: React.FC<PinScreenProps> = ({ navigation }) => {
  const [storedPin, setStoredPin] = useState<string>('1234');

  useEffect(() => {
    loadPin();
  }, []);

  const loadPin = async (): Promise<void> => {
    const pin = await StorageService.getPin();
    if (pin) setStoredPin(pin);
  };

  const handleSuccess = (): void => {
    navigation.navigate('Settings');
  };

  return (
    <View style={styles.container}>
      <PinInput onSuccess={handleSuccess} storedPin={storedPin} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default PinScreen;
