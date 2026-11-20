/**
 * #177: the media guard wraps play(), Audio, AudioContext and getUserMedia in the page, so it is
 * installed only when "Pause audio/video when hidden" is on, and starts paused when the WebView is
 * mounted while media is paused (behind the screensaver).
 */
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: () => {} }) };
});

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

jest.mock('react-native-webview', () => {
  const R = require('react');
  const { View } = require('react-native');
  const WebView = R.forwardRef((props: any, ref: any) => {
    R.useImperativeHandle(ref, () => ({ injectJavaScript: () => {}, reload: () => {} }));
    return R.createElement(View, props);
  });
  return { WebView, default: WebView };
});

const { NativeModules } = require('react-native');
NativeModules.HttpServerModule = {
  executeNativeCommand: jest.fn(),
  captureScreenshotBase64: jest.fn(),
};

const WebViewComponent = require('../src/components/WebViewComponent').default;
const { MEDIA_GUARD_JS, MEDIA_PAUSE_JS } = require('../src/utils/mediaGuard');

async function injectedAtDocumentStart(props: Record<string, unknown>) {
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(WebViewComponent, { url: 'http://10.0.2.2:9201/', autoReload: false, ...props }),
    );
  });
  for (let i = 0; i < 5; i++) { await act(async () => {}); }
  return renderer.root.findAll((n: any) => n.props.source && 'injectedJavaScriptBeforeContentLoadedForMainFrameOnly' in n.props)[0]
    .props.injectedJavaScriptBeforeContentLoaded;
}

test('nothing is injected into the page while the option is off', async () => {
  expect(await injectedAtDocumentStart({})).toBeUndefined();
  expect(await injectedAtDocumentStart({ mediaGuard: false, initialMediaPaused: true })).toBeUndefined();
});

test('the guard is installed with the option on', async () => {
  expect(await injectedAtDocumentStart({ mediaGuard: true })).toBe(MEDIA_GUARD_JS);
});

test('a WebView mounted behind the screensaver starts paused', async () => {
  expect(await injectedAtDocumentStart({ mediaGuard: true, initialMediaPaused: true })).toBe(MEDIA_PAUSE_JS);
});
