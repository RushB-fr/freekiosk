/**
 * Pull to refresh for the kiosk WebView, injected into the main frame. react-native-webview's
 * own `pullToRefreshEnabled` is iOS only, so on Android the page does it: a drag down that
 * starts with the page at the top reloads it once the drag passes PULL_REFRESH_THRESHOLD CSS
 * pixels, as in a browser.
 *
 * Not a pull:
 * - the page, or any scroller on the touched path, is scrolled. Home Assistant scrolls a
 *   div inside shadow DOM while the page stays at the top, so the path comes from
 *   composedPath(), which reaches into open shadow roots;
 * - the page took the gesture itself with preventDefault (a map, a slider). The listeners sit
 *   on window in the bubble phase, so the page's own handlers have run by then;
 * - the root opts out with overscroll-behavior-y, as Chrome's own pull to refresh honours;
 * - a sideways drag, or a second finger.
 *
 * The message carries a token the page cannot read (it lives in this closure): an iframe can
 * post messages too, but never gets this script, so it cannot reload the page.
 */
export const PULL_REFRESH_THRESHOLD = 120;

export const pullToRefreshScript = (token: string): string => `
(function() {
  if (window.__fkPullToRefresh) return;
  window.__fkPullToRefresh = true;
  var THRESHOLD = ${PULL_REFRESH_THRESHOLD};
  var message = ${JSON.stringify('pull-refresh:' + token)};
  var startX = 0, startY = 0, dy = 0, tracking = false, pulling = false, indicator = null;

  function optedOut(el) {
    var v = el ? getComputedStyle(el).overscrollBehaviorY : '';
    return v === 'none' || v === 'contain';
  }
  function blocked(e) {
    if (window.scrollY > 0 || optedOut(document.documentElement) || optedOut(document.body)) return true;
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      if (path[i].scrollTop > 0) return true;
    }
    return false;
  }
  function show(d) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.textContent = '\\u21BB';
      indicator.style.cssText = 'position:fixed;top:0;left:50%;width:40px;height:40px;margin-left:-20px;' +
        'border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;' +
        'align-items:center;justify-content:center;font:bold 24px/1 sans-serif;' +
        'z-index:2147483647;pointer-events:none;';
      document.documentElement.appendChild(indicator);
    }
    var p = Math.min(Math.max(d, 0) / THRESHOLD, 1);
    indicator.style.transform = 'translateY(' + (Math.min(Math.max(d, 0), THRESHOLD * 1.5) * 0.5 - 40) +
      'px) rotate(' + (p * 270) + 'deg)';
    indicator.style.opacity = String(0.4 + p * 0.6);
    indicator.style.color = p >= 1 ? '#1a73e8' : '#555';
  }
  function hide() {
    if (indicator && indicator.parentNode) indicator.parentNode.removeChild(indicator);
    indicator = null;
  }
  function reset() {
    tracking = false;
    pulling = false;
    dy = 0;
    hide();
  }

  window.addEventListener('touchstart', function(e) {
    reset();
    if (e.touches.length !== 1 || blocked(e)) return;
    tracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', function(e) {
    if (!tracking) return;
    if (e.touches.length !== 1 || e.defaultPrevented || window.scrollY > 0) { reset(); return; }
    var dx = e.touches[0].clientX - startX;
    dy = e.touches[0].clientY - startY;
    if (!pulling) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (dy <= Math.abs(dx)) { reset(); return; }
      pulling = true;
    }
    show(dy);
  }, { passive: true });

  window.addEventListener('touchend', function() {
    if (pulling && dy >= THRESHOLD) {
      tracking = false;
      pulling = false;
      window.ReactNativeWebView.postMessage(message);
      // The reload replaces the document. Should it not come, do not leave the arrow up.
      setTimeout(hide, 3000);
    } else {
      reset();
    }
  }, { passive: true });
  window.addEventListener('touchcancel', reset, { passive: true });
})();
`;
