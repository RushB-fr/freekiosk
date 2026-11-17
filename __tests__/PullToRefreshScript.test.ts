/**
 * The pull to refresh script runs in the page. Run it here against a minimal stand-in for
 * window and document, and drive it with touch events.
 */
export {};

const { pullToRefreshScript, PULL_REFRESH_THRESHOLD } = require('../src/utils/pullToRefreshScript');

type Opts = { scrollY?: number; overscroll?: string };

const setup = ({ scrollY = 0, overscroll = 'auto' }: Opts = {}) => {
  const handlers: Record<string, (e: any) => void> = {};
  const posted: string[] = [];
  const window: any = {
    scrollY,
    addEventListener: (type: string, fn: (e: any) => void) => { handlers[type] = fn; },
    ReactNativeWebView: { postMessage: (m: string) => posted.push(m) },
  };
  const document: any = {
    body: {},
    documentElement: {
      appendChild: (el: any) => { el.parentNode = { removeChild: () => { el.parentNode = null; } }; },
    },
    createElement: () => ({ style: {} }),
  };
  const getComputedStyle = () => ({ overscrollBehaviorY: overscroll });
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'getComputedStyle', 'setTimeout', pullToRefreshScript('TOKEN'))(
    window, document, getComputedStyle, () => {},
  );

  const event = (touches: Array<[number, number]>, extra: { path?: any[]; prevented?: boolean } = {}) => ({
    touches: touches.map(([x, y]) => ({ clientX: x, clientY: y })),
    composedPath: () => extra.path ?? [],
    defaultPrevented: !!extra.prevented,
  });
  /** One finger from (x, 10) down to (x + dx, 10 + dy), in a few steps. */
  const drag = (dx: number, dy: number, extra: { path?: any[]; prevented?: boolean } = {}) => {
    handlers.touchstart(event([[100, 10]], extra));
    for (let i = 1; i <= 4; i++) {
      handlers.touchmove(event([[100 + (dx * i) / 4, 10 + (dy * i) / 4]], extra));
    }
    handlers.touchend(event([]));
  };
  return { handlers, posted, drag, event };
};

describe('pull to refresh in the page', () => {
  it('asks for a reload after a drag down past the threshold, from the top', () => {
    const { posted, drag } = setup();
    drag(0, PULL_REFRESH_THRESHOLD + 30);
    expect(posted).toEqual(['pull-refresh:TOKEN']);
  });

  it('does nothing for a short drag', () => {
    const { posted, drag } = setup();
    drag(0, PULL_REFRESH_THRESHOLD - 30);
    expect(posted).toEqual([]);
  });

  it('does nothing when the drag is pulled back up before letting go', () => {
    const { posted, handlers, event } = setup();
    handlers.touchstart(event([[100, 10]]));
    handlers.touchmove(event([[100, 200]]));
    handlers.touchmove(event([[100, 40]]));
    handlers.touchend(event([]));
    expect(posted).toEqual([]);
  });

  it('does nothing when the page is scrolled', () => {
    const { posted, drag } = setup({ scrollY: 300 });
    drag(0, 300);
    expect(posted).toEqual([]);
  });

  it('does nothing when a scroller on the touched path is scrolled (Home Assistant)', () => {
    const { posted, drag } = setup();
    drag(0, 300, { path: [{ scrollTop: 0 }, { scrollTop: 250 }, { scrollTop: 0 }] });
    expect(posted).toEqual([]);
  });

  it('pulls when the scrollers on the touched path are at their top', () => {
    const { posted, drag } = setup();
    drag(0, 300, { path: [{ scrollTop: 0 }, { scrollTop: 0 }] });
    expect(posted).toEqual(['pull-refresh:TOKEN']);
  });

  it('does nothing when the page took the gesture itself', () => {
    const { posted, drag } = setup();
    drag(0, 300, { prevented: true });
    expect(posted).toEqual([]);
  });

  it('does nothing for a sideways drag', () => {
    const { posted, drag } = setup();
    drag(400, 200);
    expect(posted).toEqual([]);
  });

  it('does nothing with two fingers', () => {
    const { posted, handlers, event } = setup();
    handlers.touchstart(event([[100, 10], [200, 10]]));
    handlers.touchmove(event([[100, 300], [200, 300]]));
    handlers.touchend(event([]));
    expect(posted).toEqual([]);
  });

  it('honours a page that opts out with overscroll-behavior', () => {
    const { posted, drag } = setup({ overscroll: 'none' });
    drag(0, 300);
    expect(posted).toEqual([]);
  });
});
