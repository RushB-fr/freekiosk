// Native modules are null under Jest, so the app tree cannot be imported without mocks.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  return { WebView, default: WebView };
});
