import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '../utils/storage';
import KioskModule from '../utils/KioskModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

interface SettingsScreenProps {
  navigation: SettingsScreenNavigationProp;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const [url, setUrl] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [autoReload, setAutoReload] = useState<boolean>(false);
  const [kioskEnabled, setKioskEnabled] = useState<boolean>(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async (): Promise<void> => {
    const savedUrl = await StorageService.getUrl();
    const savedPin = await StorageService.getPin();
    const savedAutoReload = await StorageService.getAutoReload();
    const savedKioskEnabled = await StorageService.getKioskEnabled();
    
    if (savedUrl) setUrl(savedUrl);
    if (savedPin) setPin(savedPin);
    setAutoReload(savedAutoReload);
    setKioskEnabled(savedKioskEnabled);
  };

  const handleSave = async (): Promise<void> => {
    if (!url) {
      Alert.alert('Error', 'Please enter a URL');
      return;
    }

    if (!pin || pin.length < 4) {
      Alert.alert('Error', 'PIN code must contain at least 4 digits');
      return;
    }

    await StorageService.saveUrl(url);
    await StorageService.savePin(pin);
    await StorageService.saveAutoReload(autoReload);
    await StorageService.saveKioskEnabled(kioskEnabled);

    // Activer/désactiver Lock Task selon toggle
    if (kioskEnabled) {
      try {
        await KioskModule.startLockTask();
        Alert.alert('Success', 'Configuration saved\nScreen pinning enabled - swipe gestures blocked', [
          { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
        ]);
      } catch (error) {
        Alert.alert('Warning', 'Configuration saved\nDevice Owner not configured - screen pinning unavailable', [
          { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
        ]);
      }
    } else {
      try {
        await KioskModule.stopLockTask();
      } catch (error) {
        console.log('Not in lock task mode');
      }
      Alert.alert('Success', 'Configuration saved\nScreen pinning disabled - swipe up to exit', [
        { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
      ]);
    }
  };

  const handleResetSettings = async (): Promise<void> => {
    Alert.alert(
      'Reset Settings',
      'This will erase all settings (URL, PIN, preferences) and restart the app with default values.\n\nContinue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear AsyncStorage
              await AsyncStorage.clear();
              
              // Réinitialiser les states
              setUrl('');
              setPin('');
              setAutoReload(false);
              setKioskEnabled(false);
              
              // Arrêter Lock Task si actif
              try {
                await KioskModule.stopLockTask();
              } catch (e) {
                console.log('Not in lock task');
              }
              
              Alert.alert('Success', 'Settings reset successfully!\nPlease configure the app again.', [
                { text: 'OK', onPress: () => navigation.navigate('Kiosk') },
              ]);
            } catch (error) {
              Alert.alert('Error', `Failed to reset settings: ${error}`);
            }
          },
        },
      ],
    );
  };

  const handleExitKioskMode = async (): Promise<void> => {
    Alert.alert(
      'Exit Kiosk Mode',
      'Are you sure you want to exit kiosk mode?\n\nThis will close the application and disable the lock.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await KioskModule.exitKioskMode();
              if (!result) {
                Alert.alert('Info', 'Kiosk mode disabled');
              }
            } catch (error) {
              Alert.alert('Error', `Unable to exit: ${error}`);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>⚙️ Kiosk Configuration</Text>

        <View style={styles.section}>
          <Text style={styles.label}>🌐 URL to Display</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com"
            keyboardType="url"
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Example: https://www.freekiosk.app
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>🔐 PIN Code</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="1234"
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
          />
          <Text style={styles.hint}>
            Minimum 4 digits (default: 1234)
          </Text>
        </View>

        {/* Screen Pinning Toggle */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{flex: 1}}>
              <Text style={styles.label}>📌 Pin App to Screen</Text>
              <Text style={styles.hint}>
                Lock app in kiosk mode (requires Device Owner){'\n'}
                When ON: Swipe gestures blocked, need PIN to exit{'\n'}
                When OFF: Swipe up to exit normally
              </Text>
            </View>
            <Switch
              value={kioskEnabled}
              onValueChange={setKioskEnabled}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={kioskEnabled ? '#0066cc' : '#f4f3f4'}
            />
          </View>
          
          {!kioskEnabled && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ Warning: With screen pinning disabled, users can swipe up to exit the app
              </Text>
            </View>
          )}

          {kioskEnabled && (
            <View style={styles.infoSubBox}>
              <Text style={styles.infoSubText}>
                ℹ️ Screen pinning enabled: Only 5-tap gesture + PIN code allows exit
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{flex: 1}}>
              <Text style={styles.label}>🔄 Automatic Reload</Text>
              <Text style={styles.hint}>
                Automatically reload the page on error
              </Text>
            </View>
            <Switch
              value={autoReload}
              onValueChange={setAutoReload}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={autoReload ? '#0066cc' : '#f4f3f4'}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>💾 Save</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.navigate('Kiosk')}
        >
          <Text style={styles.cancelButtonText}>↩️ Back to Kiosk</Text>
        </TouchableOpacity>

        
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetSettings}
        >
          <Text style={styles.resetButtonText}>🔄 Reset All Settings</Text>
        </TouchableOpacity>

        {kioskEnabled && (
          <TouchableOpacity
            style={styles.exitButton}
            onPress={handleExitKioskMode}
          >
            <Text style={styles.exitButtonText}>🚪 Exit Kiosk Mode</Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ How to Use</Text>
          <Text style={styles.infoText}>
            • Configure the URL of the web page to display{'\n'}
            • Set a secure PIN code{'\n'}
            • Enable "Pin App to Screen" for full kiosk mode{'\n'}
            • Tap 5 times in the bottom-right corner to access settings{'\n'}
            • Enter PIN code to unlock
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    marginTop: 20,
    color: '#333',
    textAlign: 'center',
  },
  section: {
    marginBottom: 25,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    lineHeight: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  warningBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
  },
  infoSubBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  infoSubText: {
    fontSize: 13,
    color: '#01579b',
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
    shadowColor: '#0066cc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#ff9800',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#f57c00',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  exitButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#b71c1c',
  },
  exitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0066cc',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
});

export default SettingsScreen;
