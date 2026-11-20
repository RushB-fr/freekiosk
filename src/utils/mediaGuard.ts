/**
 * #177 — Pause a page's audio and video while it stays awake.
 *
 * Passed as injectedJavaScriptBeforeContentLoaded with ...ForMainFrameOnly={false}: our
 * react-native-webview patch registers it as a document-start script in every frame, cross-origin
 * iframes too, where the WebView supports DOCUMENT_START_SCRIPT; otherwise it runs in the main frame
 * from onPageStarted. It does nothing until `window.__fkMedia(true)`: then it pauses every
 * <audio>/<video>, also one made with `new Audio()` and never put in the page, suspends the page's
 * AudioContexts, mutes its camera and microphone tracks, refuses `play()` and
 * `AudioContext.resume()` until `__fkMedia(false)`, and passes the state on to its child frames.
 * Media stays paused after `__fkMedia(false)`; the AudioContexts and tracks it stopped come back.
 *
 * Replaces WebView.onPause(), which also hid the page: requestAnimationFrame and CSS animations
 * stopped, timers were throttled, and a page reacting to visibilitychange went to sleep (Home
 * Assistant drops its connection after 5 minutes hidden).
 *
 * Not covered: OfflineAudioContext (renders to a buffer, never to the speaker) and the
 * webkitAudioContext prefix (a page falls back to it only without AudioContext, which every
 * WebView from Android 7 on has).
 */
export const MEDIA_GUARD_JS = `(function(){
if (window.__fkMedia) return;
var paused = false;
var playing = new Set();         // media started while not paused: reaches a detached new Audio()
var contexts = [];               // every AudioContext of the page
var suspendedContexts = [];      // the ones to resume when the guard lifts
var streams = [];                // every getUserMedia stream of the page
var mutedTracks = [];            // the camera/microphone tracks to unmute when the guard lifts
function refuse() { return Promise.reject(new DOMException('Paused by FreeKiosk', 'NotAllowedError')); }
function pauseElement(m) { try { m.pause(); } catch (e) {} }
function onPlay(e) { if (paused) pauseElement(e.target); else playing.add(e.target); }
function suspendContext(c) {
  if (suspendedContexts.indexOf(c) < 0) suspendedContexts.push(c);
  c.suspend().catch(function () {});
}
function muteTrack(t) {
  if (t.readyState === 'live' && t.enabled) { t.enabled = false; mutedTracks.push(t); }
}
// The state travels down one frame at a time, as JSON strings so that a page's own message
// handler that JSON.parses e.data does not throw on them. A parent sends its state to its child
// frames on every change; a frame starting up asks its parent, so an iframe added or reloaded
// behind the screensaver starts paused.
function post(w, message) { try { w.postMessage(JSON.stringify(message), '*'); } catch (e) {} }
function setPaused(p) {
  paused = p;
  if (p) {
    document.querySelectorAll('audio,video').forEach(pauseElement);
    playing.forEach(pauseElement);
    playing.clear();
    contexts.forEach(function (c) { if (c.state === 'running') suspendContext(c); });
    streams.forEach(function (s) { s.getTracks().forEach(muteTrack); });
  } else {
    // paused is already false, so the wrapped resume() below lets these through.
    suspendedContexts.forEach(function (c) { c.resume().catch(function () {}); });
    suspendedContexts = [];
    mutedTracks.forEach(function (t) { t.enabled = true; });
    mutedTracks = [];
  }
  for (var i = 0; i < window.frames.length; i++) post(window.frames[i], { __fkMedia: 'state', paused: p });
}
window.__fkMedia = setPaused;
var play = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  if (paused) return refuse();
  // Forget the ones that stopped by themselves, so the set does not keep every element alive.
  playing.forEach(function (m) { if (m.paused) playing.delete(m); });
  playing.add(this);
  return play.apply(this, arguments);
};
window.addEventListener('play', onPlay, true);
if (window.Audio) {
  window.Audio = new Proxy(window.Audio, {
    construct: function (t, a, n) {
      var m = Reflect.construct(t, a, n);
      // A detached element's play event never reaches window: an autoplaying one is caught here.
      m.addEventListener('play', onPlay);
      return m;
    }
  });
}
if (window.AudioContext) {
  var resume = window.AudioContext.prototype.resume;
  window.AudioContext.prototype.resume = function () {
    if (!paused) return resume.apply(this, arguments);
    if (suspendedContexts.indexOf(this) < 0) suspendedContexts.push(this);
    return refuse();
  };
  window.AudioContext = new Proxy(window.AudioContext, {
    construct: function (t, a, n) {
      var c = Reflect.construct(t, a, n);
      contexts = contexts.filter(function (x) { return x.state !== 'closed'; });
      contexts.push(c);
      if (paused) suspendContext(c);
      return c;
    }
  });
}
var mediaDevices = window.navigator && window.navigator.mediaDevices;
if (mediaDevices && mediaDevices.getUserMedia) {
  var getUserMedia = mediaDevices.getUserMedia;
  mediaDevices.getUserMedia = function () {
    return getUserMedia.apply(this, arguments).then(function (s) {
      streams = streams.filter(function (x) { return x.active; });
      streams.push(s);
      if (paused) s.getTracks().forEach(muteTrack);
      return s;
    });
  };
}
window.addEventListener('message', function (e) {
  if (typeof e.data !== 'string' || e.data.indexOf('"__fkMedia"') < 0) return;
  var d;
  try { d = JSON.parse(e.data); } catch (x) { return; }
  if (d.__fkMedia === 'ask') {
    post(e.source, { __fkMedia: 'state', paused: paused });
  } else if (d.__fkMedia === 'state' && window.parent !== window && e.source === window.parent) {
    setPaused(d.paused === true);
  }
});
if (window.parent !== window) post(window.parent, { __fkMedia: 'ask' });
})();`;

// Also the document-start script while paused, so a page loaded behind the screensaver (auto
// reload, URL rotation, a URL set over REST/MQTT) starts paused.
export const MEDIA_PAUSE_JS = `${MEDIA_GUARD_JS}window.__fkMedia(true);true;`;
export const MEDIA_RESUME_JS = 'window.__fkMedia && window.__fkMedia(false);true;';
