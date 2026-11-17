import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, StyleSheet, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import KioskScreen from '../screens/KioskScreen';
import PinScreen from '../screens/PinScreen';
// v1.2: Use new settings screen with Material tabs
import { SettingsScreen } from '../screens/settings';
import BlockingOverlaysScreen from '../screens/settings/BlockingOverlaysScreen';
import KioskModule from '../utils/KioskModule';

export type RootStackParamList = {
  Kiosk: undefined;
  Pin: undefined;
  Settings: undefined;
  BlockingOverlays: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const protectedSettingsPendingRef = useRef(false);
  const [initialRoute, setInitialRoute] = useState<'Kiosk' | 'Pin' | null>(null);

  const openProtectedSettings = useCallback((): void => {
    protectedSettingsPendingRef.current = true;
    if (!navigationRef.isReady()) return;

    if (navigationRef.getCurrentRoute()?.name !== 'Pin') {
      navigationRef.navigate('Pin');
    }
    protectedSettingsPendingRef.current = false;
  }, [navigationRef]);

  useEffect(() => {
    let mounted = true;
    const eventEmitter = new NativeEventEmitter(NativeModules.DeviceEventManagerModule);
    const listener = eventEmitter.addListener('openProtectedSettings', () => {
      openProtectedSettings();
      KioskModule.consumeProtectedSettingsRequest().catch(() => {});
    });

    // A notification can create MainActivity before the React bridge exists. Resolve
    // that retained native request before mounting any route, preventing a cold-start
    // flash of the child-facing kiosk before the PIN screen.
    KioskModule.consumeProtectedSettingsRequest()
      .then(pending => {
        if (!mounted) return;
        if (pending) protectedSettingsPendingRef.current = true;
        setInitialRoute(protectedSettingsPendingRef.current ? 'Pin' : 'Kiosk');
      })
      .catch(() => {
        if (mounted) setInitialRoute(protectedSettingsPendingRef.current ? 'Pin' : 'Kiosk');
      });

    return () => {
      mounted = false;
      listener.remove();
    };
  }, [openProtectedSettings]);

  if (initialRoute === null) {
    return <View style={styles.loading} />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        if (protectedSettingsPendingRef.current) openProtectedSettings();
      }}
    >
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen 
          name="Kiosk" 
          component={KioskScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen 
          name="Pin" 
          component={PinScreen}
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{
            headerShown: false, // v1.2: Custom header with tabs
            gestureEnabled: false,
          }}
        />
        <Stack.Screen 
          name="BlockingOverlays" 
          component={BlockingOverlaysScreen}
          options={{
            headerShown: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#333333',
  },
});

export default AppNavigator;
