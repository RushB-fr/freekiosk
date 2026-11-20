import { MEDIA_GUARD_JS, MEDIA_PAUSE_JS, MEDIA_RESUME_JS } from '../src/utils/mediaGuard';

// #177: the guard pauses media and Web Audio, mutes camera/microphone, refuses play() and
// AudioContext.resume() while paused, and passes the state to child frames.
function makeFrame(frames: any[] = []) {
  class HTMLMediaElement {
    paused = true;
    listeners: Function[] = [];
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    addEventListener(_type: string, fn: Function) { this.listeners.push(fn); }
    autoplay() { this.paused = false; this.listeners.forEach(fn => fn({ target: this })); }
  }
  class Audio extends HTMLMediaElement {}
  class AudioContext {
    state = 'running';
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  const track = { readyState: 'live', enabled: true };
  const stream = { active: true, getTracks: () => [track] };
  const inPage = new HTMLMediaElement();
  const listeners: Record<string, Function[]> = {};
  const win: any = {
    Audio,
    AudioContext,
    frames,
    navigator: { mediaDevices: { getUserMedia: () => Promise.resolve(stream) } },
    document: { querySelectorAll: () => [inPage] },
    addEventListener: (type: string, fn: Function) => { (listeners[type] ||= []).push(fn); },
  };
  win.parent = win;
  win.HTMLMediaElement = HTMLMediaElement;
  // The page's globals the guard reads; everything else it reaches through window.
  const run = (js: string) =>
    // eslint-disable-next-line no-new-func -- runs the injected script the way the page would
    new Function('window', 'document', 'HTMLMediaElement', 'DOMException', js)(
      win, win.document, HTMLMediaElement, class extends Error {});
  return { win, inPage, track, listeners, run };
}

test('pauses media, Web Audio and camera/microphone, blocks play, brings back all but media', async () => {
  const child = { postMessage: jest.fn() };
  const { win, inPage, track, run } = makeFrame([child]);
  run(MEDIA_GUARD_JS);
  run(MEDIA_GUARD_JS); // installed twice (document start + injection): must stay one guard

  const detached = new win.HTMLMediaElement(); // never put in the page
  await detached.play();
  await inPage.play();
  const ctx = new win.AudioContext();
  await win.navigator.mediaDevices.getUserMedia({ audio: true });

  run(MEDIA_PAUSE_JS);
  expect(inPage.paused).toBe(true);
  expect(detached.paused).toBe(true);
  expect(ctx.state).toBe('suspended');
  expect(track.enabled).toBe(false);
  expect(child.postMessage).toHaveBeenCalledWith(JSON.stringify({ __fkMedia: 'state', paused: true }), '*');
  await expect(detached.play()).rejects.toThrow('Paused by FreeKiosk');
  await expect(ctx.resume()).rejects.toThrow('Paused by FreeKiosk');
  expect(ctx.state).toBe('suspended');

  run(MEDIA_RESUME_JS);
  expect(ctx.state).toBe('running');
  expect(track.enabled).toBe(true);
  expect(inPage.paused).toBe(true);
  await detached.play();
  expect(detached.paused).toBe(false);
});

test('Web Audio comes back after two pauses in a row', () => {
  const { win, run } = makeFrame();
  run(MEDIA_GUARD_JS);
  const ctx = new win.AudioContext();
  run(MEDIA_PAUSE_JS); // screensaver
  run(MEDIA_PAUSE_JS); // then the app goes to the background
  run(MEDIA_RESUME_JS);
  expect(ctx.state).toBe('running');
});

test('a page loaded while paused starts paused, an autoplaying new Audio() included', async () => {
  const { win, run } = makeFrame();
  run(MEDIA_PAUSE_JS); // the document-start script while paused
  const audio = new win.Audio();
  audio.autoplay();
  expect(audio.paused).toBe(true);
  await expect(audio.play()).rejects.toThrow('Paused by FreeKiosk');
});

test('a child frame follows only its parent', () => {
  const { win, inPage, listeners, run } = makeFrame();
  const parent = { postMessage: jest.fn() };
  win.parent = parent;
  run(MEDIA_GUARD_JS);
  expect(parent.postMessage).toHaveBeenCalledWith(JSON.stringify({ __fkMedia: 'ask' }), '*');

  inPage.paused = false;
  const onMessage = listeners.message[0];
  const state = JSON.stringify({ __fkMedia: 'state', paused: true });
  onMessage({ data: state, source: {} }); // someone else
  expect(inPage.paused).toBe(false);
  onMessage({ data: { __fkMedia: 'state', paused: true }, source: parent }); // not our format
  expect(inPage.paused).toBe(false);
  onMessage({ data: state, source: parent });
  expect(inPage.paused).toBe(true);
});
