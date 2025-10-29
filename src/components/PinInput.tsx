import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

interface PinInputProps {
  onSuccess: () => void;
  storedPin: string;
}

const PinInput: React.FC<PinInputProps> = ({ onSuccess, storedPin }) => {
  const [pin, setPin] = useState<string>('');

  const handleSubmit = (): void => {
    if (pin === storedPin) {
      onSuccess();
    } else {
      Alert.alert('Error', 'Incorrect PIN code');
      setPin('');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter PIN Code</Text>
      <Text style={styles.subtitle}>Default code: 1234</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        keyboardType="numeric"
        secureTextEntry
        maxLength={6}
        placeholder="••••"
        autoFocus
      />
      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Validate</Text>
      </TouchableOpacity>
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
  button: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 50,
    paddingVertical: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PinInput;
