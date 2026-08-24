module.exports = {
  preset: 'react-native',
  // The react-native preset only transforms react-native itself, so any dependency
  // shipping untranspiled ESM (react-navigation, react-native-* modules, …) throws
  // "Unexpected token 'export'" the moment a test imports the app tree.
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?@?react-native|@react-native-community|@react-native-async-storage|@react-navigation|react-native-.*|@?react-native-vector-icons)/',
  ],
};
