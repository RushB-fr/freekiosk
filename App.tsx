import React from 'react';
import { StatusBar } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';

const App: React.FC = () => {
  return (
    <>
      <StatusBar hidden={true} />
      <AppNavigator />
    </>
  );
};

export default App;
