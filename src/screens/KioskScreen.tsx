import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import WebViewComponent from '../components/WebViewComponent';
import { StorageService } from '../utils/storage';
import KioskModule from '../utils/KioskModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type KioskScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Kiosk'>;

interface KioskScreenProps {
  navigation: KioskScreenNavigationProp;
}

let tapCount = 0;
let tapTimer: any = null;

const KioskScreen: React.FC<KioskScreenProps> = ({ navigation }) => {
  const [url, setUrl] = useState<string>('');
  const [autoReload, setAutoReload] = useState<boolean>(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadSettings();
    });

    return unsubscribe;
  }, [navigation]);

  const loadSettings = async (): Promise<void> => {
    const savedUrl = await StorageService.getUrl();
    const savedAutoReload = await StorageService.getAutoReload();
    const savedKioskEnabled = await StorageService.getKioskEnabled();
    
    if (savedUrl) setUrl(savedUrl);
    setAutoReload(savedAutoReload);

    // Appliquer Lock Task si activé
    if (savedKioskEnabled) {
      try {
        await KioskModule.startLockTask();
        console.log('[KioskScreen] Lock task enabled');
      } catch (error) {
        console.log('[KioskScreen] Lock task not available:', error);
      }
    } else {
      try {
        await KioskModule.stopLockTask();
        console.log('[KioskScreen] Lock task disabled');
      } catch (error) {
        console.log('[KioskScreen] Not in lock task mode');
      }
    }
  };

  const handleSecretTap = (): void => {
    tapCount++;
    
    if (tapTimer) clearTimeout(tapTimer);
    
    if (tapCount === 5) {
      tapCount = 0;
      navigation.navigate('Pin');
    }
    
    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <WebViewComponent url={url} autoReload={autoReload} />
      
      <TouchableOpacity
        style={styles.secretButton}
        onPress={handleSecretTap}
        activeOpacity={1}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  secretButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 80,
    height: 80,
    backgroundColor: 'transparent',
  },
});

export default KioskScreen;
