import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
// Initialises i18next before any screen renders: the PIN screen, the WebView and the
// external app screen translate too, not only the settings screens.
import { loadStoredLanguage } from './src/i18n';
import AppNavigator from './src/navigation/AppNavigator';

const App: React.FC = () => {
  // i18next starts in the device language; switch to the one chosen in Settings, if any
  useEffect(() => {
    loadStoredLanguage().catch(() => {});
  }, []);

  return (
    <>
      <StatusBar hidden={true} />
      <AppNavigator />
    </>
  );
};

export default App;
