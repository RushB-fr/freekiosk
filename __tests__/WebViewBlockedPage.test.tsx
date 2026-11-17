/**
 * #366: with the URL filter in whitelist mode, an address that redirects outside the list was
 * blocked silently and the WebView stayed on a blank view. When no page is shown, the error screen
 * now says the navigation was blocked; with a page on screen nothing changes.
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

const mockReload = jest.fn();
jest.mock('react-native-webview', () => {
  const R = require('react');
  const { View } = require('react-native');
  const WebView = R.forwardRef((props: any, ref: any) => {
    R.useImperativeHandle(ref, () => ({ injectJavaScript: () => {}, reload: () => mockReload() }));
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

const START = 'http://10.0.2.2:9201/';
const BLOCKED = 'http://10.0.2.2:9101/some/path?x=1';
const ALLOWED = 'http://10.0.2.2:9202/';

let renderer: any;

async function mount(props: Record<string, unknown> = {}) {
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(WebViewComponent, {
        url: START,
        autoReload: false,
        urlFilterMode: 'whitelist',
        urlFilterPatterns: ['10.0.2.2:9201', '10.0.2.2:9202'],
        ...props,
      }),
    );
  });
  for (let i = 0; i < 5; i++) { await act(async () => {}); }
}

const webView = () => renderer.root.findAll((n: any) => typeof n.props.onShouldStartLoadWithRequest === 'function' && n.props.source)[0];
// Android sends no isTopFrame, so tests pass undefined unless a frame is meant.
const navigate = (url: string, isTopFrame: boolean | undefined = undefined): boolean => {
  let result: boolean = true;
  act(() => { result = webView().props.onShouldStartLoadWithRequest({ url, isTopFrame, navigationType: 'other' }); });
  return result;
};
const loaded = (url: string) => act(() => { webView().props.onLoad({ nativeEvent: { url } }); });

function texts(): string[] {
  return renderer.root
    .findAll((n: any) => typeof n.type === 'string' && n.type === 'Text')
    .map((n: any) => [].concat(n.props.children).join(''));
}

beforeEach(() => { mockReload.mockClear(); jest.useFakeTimers(); });
afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = undefined;
  jest.useRealTimers();
});

describe('a navigation blocked by the URL filter', () => {
  it('names the filter when the main page is blocked and nothing is shown', async () => {
    await mount();
    expect(navigate(BLOCKED)).toBe(false);
    expect(texts()).not.toContain('Loading Error'); // not before onLoad says the main page was meant
    loaded(BLOCKED); // what Android fires when it cancels the main-frame load
    const all = texts();
    expect(all).toContain('Loading Error');
    expect(all).toContain('Reason: Blocked by the URL filter: 10.0.2.2:9101');
  });

  it('leaves the host out when the address is hidden', async () => {
    await mount({ hideErrorUrl: true });
    navigate(BLOCKED);
    loaded(BLOCKED);
    const all = texts();
    expect(all).toContain('Reason: Blocked by the URL filter');
    expect(all.some(t => t.includes('9101'))).toBe(false);
  });

  it('shows no notice when a blocked frame is followed by the page itself', async () => {
    await mount();
    navigate(BLOCKED); // a frame inside a page still loading
    loaded(ALLOWED);
    expect(texts()).not.toContain('Loading Error');
    // and the page counts as shown: a later blocked navigation changes nothing
    navigate(BLOCKED);
    loaded(BLOCKED);
    expect(texts()).not.toContain('Loading Error');
  });

  it('changes nothing when a page is already shown', async () => {
    await mount();
    loaded(ALLOWED);
    expect(navigate(BLOCKED)).toBe(false);
    loaded(BLOCKED);
    expect(texts()).not.toContain('Loading Error');
  });

  it('is not counted as a page when only about:blank finished loading', async () => {
    await mount();
    loaded('about:blank');
    navigate(BLOCKED);
    loaded(BLOCKED);
    expect(texts()).toContain('Loading Error');
  });

  it('ignores a blocked frame that Android flags as not the top frame', async () => {
    await mount();
    expect(navigate(BLOCKED, false)).toBe(false);
    loaded(BLOCKED);
    expect(texts()).not.toContain('Loading Error');
  });

  it('lets an allowed address through without any notice', async () => {
    await mount();
    expect(navigate(ALLOWED)).toBe(true);
    loaded(ALLOWED);
    expect(texts()).not.toContain('Loading Error');
  });

  it('shows no notice when no filter is set', async () => {
    await mount({ urlFilterMode: undefined, urlFilterPatterns: undefined });
    expect(navigate(BLOCKED)).toBe(true);
    loaded(BLOCKED);
    expect(texts()).not.toContain('Loading Error');
  });

  it('goes away with the Reload Now button, and the retry can be blocked again', async () => {
    await mount();
    navigate(BLOCKED);
    loaded(BLOCKED);
    const button = renderer.root
      .findAll((n: any) => typeof n.props.onPress === 'function')
      .find((n: any) => n.findAll((c: any) => c.type === 'Text' && [].concat(c.props.children).join('') === 'Reload Now').length > 0);
    act(() => { button.props.onPress(); });
    expect(texts()).not.toContain('Loading Error');
    navigate(BLOCKED);
    loaded(BLOCKED);
    expect(texts()).toContain('Loading Error');
  });

  it('retries by itself when automatic reload is on', async () => {
    await mount({ autoReload: true });
    navigate(BLOCKED);
    loaded(BLOCKED);
    expect(texts()).toContain('Automatic reload in 5 seconds...');
    act(() => { jest.advanceTimersByTime(5000); });
    expect(texts()).not.toContain('Loading Error');
  });
});
