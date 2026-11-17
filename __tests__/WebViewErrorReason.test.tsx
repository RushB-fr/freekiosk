/**
 * #143: every page that failed to load read the same "Loading Error", and the cause (a host name
 * the certificate does not list, an expired certificate, no answer on the port) stayed in the
 * logs. The error screen now says why.
 */
export {};

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: () => {} }) };
});

// Real English strings, so a missing key fails the test instead of printing the key.
jest.mock('react-i18next', () => {
  const en = require('../src/i18n/locales/en.json');
  const t = (key: string, vars: Record<string, string> = {}) => {
    const text = key.split('.').reduce((o: any, k: string) => (o ? o[k] : undefined), en);
    if (typeof text !== 'string') { return key; }
    return text.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => String(vars[name]));
  };
  return { useTranslation: () => ({ t }) };
});

// The shared mock has no native methods; the error handlers call injectJavaScript on the ref.
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
const { loadErrorReason } = require('../src/components/WebViewComponent');

let renderer: any;

async function mount(props: Record<string, unknown> = {}) {
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(WebViewComponent, { url: 'https://homeassistant.lan/', autoReload: false, ...props }),
    );
  });
  for (let i = 0; i < 5; i++) { await act(async () => {}); }
}

const webView = () => renderer.root.findAll((n: any) => typeof n.props.onError === 'function' && n.props.source)[0];

function texts(): string[] {
  return renderer.root
    .findAll((n: any) => typeof n.type === 'string' && n.type === 'Text')
    .map((n: any) => [].concat(n.props.children).join(''));
}

afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = undefined;
});

describe('loadErrorReason', () => {
  it('returns the description Android gives', async () => {
    expect(loadErrorReason({ description: 'net::ERR_NAME_NOT_RESOLVED' })).toBe('net::ERR_NAME_NOT_RESOLVED');
  });

  it('trims it and leaves out a missing or blank one', async () => {
    expect(loadErrorReason({ description: '  net::ERR_FAILED \n' })).toBe('net::ERR_FAILED');
    expect(loadErrorReason({ description: '   ' })).toBeNull();
    expect(loadErrorReason({})).toBeNull();
    expect(loadErrorReason({ description: 42 })).toBeNull();
    expect(loadErrorReason(null)).toBeNull();
    expect(loadErrorReason(undefined)).toBeNull();
  });

  it('cuts a very long description', async () => {
    const reason = loadErrorReason({ description: 'x'.repeat(500) }) as string;
    expect(reason.length).toBe(201);
    expect(reason.endsWith('…')).toBe(true);
  });
});

describe('error screen of the WebView', () => {
  it('names the cause of a failed load', async () => {
    await mount();
    act(() => {
      webView().props.onError({
        nativeEvent: { code: -11, description: 'SSL error: The host name does not match the certificate', url: 'https://homeassistant.lan/' },
      });
    });
    const all = texts();
    expect(all).toContain('Loading Error');
    expect(all).toContain('Reason: SSL error: The host name does not match the certificate');
  });

  it('names the status of a server error', async () => {
    await mount();
    act(() => {
      webView().props.onHttpError({ nativeEvent: { statusCode: 503, url: 'https://homeassistant.lan/' } });
    });
    expect(texts()).toContain('Reason: HTTP 503');
  });

  it('shows the screen as before when Android gives no description', async () => {
    await mount();
    act(() => { webView().props.onError({ nativeEvent: { code: -2, url: 'https://homeassistant.lan/' } }); });
    const all = texts();
    expect(all).toContain('Loading Error');
    expect(all.some(t => t.startsWith('Reason:'))).toBe(false);
  });

  it('shows nothing about a failure while the page loads fine', async () => {
    await mount();
    const all = texts();
    expect(all).not.toContain('Loading Error');
    expect(all.some(t => t.startsWith('Reason:'))).toBe(false);
  });

  it('keeps the address off the screen when it is hidden, and still gives the cause', async () => {
    await mount({ hideErrorUrl: true });
    act(() => {
      webView().props.onError({
        nativeEvent: { code: -2, description: 'net::ERR_CONNECTION_REFUSED', url: 'https://homeassistant.lan/' },
      });
    });
    const all = texts();
    expect(all.some(t => t.includes('homeassistant.lan'))).toBe(false);
    expect(all).toContain('Reason: net::ERR_CONNECTION_REFUSED');
  });

  it('shows the address too when it is not hidden, as before', async () => {
    await mount();
    act(() => { webView().props.onError({ nativeEvent: { code: -2, description: 'net::ERR_FAILED' } }); });
    expect(texts()).toContain('URL: https://homeassistant.lan/');
  });
});
