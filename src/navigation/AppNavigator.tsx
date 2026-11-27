import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import KioskScreen from '../screens/KioskScreen';
import PinScreen from '../screens/PinScreen';
// v1.2: Use new settings screen with Material tabs
import { SettingsScreen } from '../screens/settings';
import BlockingOverlaysScreen from '../screens/settings/BlockingOverlaysScreen';
import SetupWizardScreen from '../screens/SetupWizardScreen';
import { isFreshInstall } from '../utils/setupWizard';
import { Colors } from '../theme';

export type RootStackParamList = {
  Kiosk: undefined;
  // The guided first launch, shown once on a tablet where nothing is configured
  Setup: undefined;
  // initialTab: the Settings tab to open once the PIN is entered (e.g. 'advanced' for Cloud)
  Pin: { initialTab?: string } | undefined;
  Settings: { initialTab?: string } | undefined;
  BlockingOverlays: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  // A tablet where nothing is configured starts on the setup wizard, every other one on the kiosk.
  // The answer comes from the storage, a few milliseconds: a plain background until then.
  const [initialRoute, setInitialRoute] = useState<'Kiosk' | 'Setup' | null>(null);
  useEffect(() => {
    let active = true;
    isFreshInstall().then((fresh) => {
      if (active) setInitialRoute(fresh ? 'Setup' : 'Kiosk');
    });
    return () => {
      active = false;
    };
  }, []);

  if (!initialRoute) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <NavigationContainer>
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
          name="Setup"
          component={SetupWizardScreen}
          options={{
            headerShown: false,
            gestureEnabled: false,
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

export default AppNavigator;
