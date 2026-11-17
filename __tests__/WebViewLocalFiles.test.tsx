/**
 * #385: a page picked with "Choose a local HTML file" is a content:// address. The WebView may
 * load it only with the local files switch (the PDF viewer one) on, and a page may not navigate
 * to one, as it may not to file://.
 */
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: () => {} }) };
});

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

let renderer: any;

async function mount(props: Record<string, unknown> = {}) {
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(WebViewComponent, { url: 'https://example.com/', autoReload: false, ...props }),
    );
  });
  for (let i = 0; i < 5; i++) { await act(async () => {}); }
}

const webView = () => renderer.root.findAll((n: any) => typeof n.props.onShouldStartLoadWithRequest === 'function' && n.props.source)[0];
const allowed = (url: string): boolean => {
  let result = true;
  act(() => { result = webView().props.onShouldStartLoadWithRequest({ url, isTopFrame: true, navigationType: 'click' }); });
  return result;
};

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = undefined;
});

describe('local files in the WebView', () => {
  it('accepts file:// and content:// origins only with the local files switch on', async () => {
    await mount({ pdfViewerEnabled: true });
    expect(webView().props.originWhitelist).toEqual(['http://*', 'https://*', 'file://*', 'content://*']);
    expect(webView().props.allowFileAccess).toBe(true);
  });

  it('keeps to web addresses with the switch off, as before', async () => {
    await mount({ pdfViewerEnabled: false });
    expect(webView().props.originWhitelist).toEqual(['http://*', 'https://*']);
    expect(webView().props.allowFileAccess).toBe(false);
  });

  it('does not let a page navigate to a content:// document or a file', async () => {
    await mount({ pdfViewerEnabled: true });
    expect(allowed('content://com.android.providers.downloads.documents/document/5')).toBe(false);
    expect(allowed('CONTENT://x/y')).toBe(false);
    expect(allowed('file:///storage/emulated/0/news/news001.html')).toBe(false);
  });

  it('still opens the bundled PDF viewer and ordinary pages', async () => {
    await mount({ pdfViewerEnabled: true });
    expect(allowed('file:///android_asset/pdfjs/viewer.html?file=x')).toBe(true);
    expect(allowed('https://example.com/other')).toBe(true);
  });
});
