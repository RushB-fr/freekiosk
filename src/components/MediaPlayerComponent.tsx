/**
 * FreeKiosk - Media Player Component
 * Full-screen media player using WebView for video/image playlists
 * Supports: video (MP4, WebM, OGG), images (JPG, PNG, GIF, WebP, SVG)
 * Features: auto-play, loop, shuffle, transitions, optional controls
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import Icon from './Icon';
import type { MediaItem, MediaFitMode } from '../types/mediaPlayer';
import { useTranslation } from 'react-i18next';

interface MediaPlayerComponentProps {
  items: MediaItem[];
  autoPlay: boolean;
  loop: boolean;
  shuffle: boolean;
  imageDuration: number;
  showControls: boolean;
  fitMode: MediaFitMode;
  backgroundColor: string;
  transitionEnabled: boolean;
  transitionDuration: number;
  muteVideo: boolean;
  onUserInteraction?: (event?: { isTap?: boolean; x?: number; y?: number }) => void;
}

const MediaPlayerComponent: React.FC<MediaPlayerComponentProps> = ({
  items,
  autoPlay,
  loop,
  shuffle,
  imageDuration,
  showControls,
  fitMode,
  backgroundColor,
  transitionEnabled,
  transitionDuration,
  muteVideo,
  onUserInteraction,
}) => {
  const { t } = useTranslation();
  const webViewRef = useRef<WebView>(null);

  const htmlContent = useMemo(() => {
    if (!items || items.length === 0) {
      return generateEmptyHTML(backgroundColor);
    }
    return generatePlayerHTML({
      items,
      autoPlay,
      loop,
      shuffle,
      imageDuration,
      showControls,
      fitMode,
      backgroundColor,
      transitionEnabled,
      transitionDuration,
      muteVideo,
    });
  }, [items, autoPlay, loop, shuffle, imageDuration, showControls, fitMode, backgroundColor, transitionEnabled, transitionDuration, muteVideo]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'interaction' && onUserInteraction) {
        onUserInteraction({ isTap: true, x: data.x, y: data.y });
      }
    } catch {
      // ignore
    }
  }, [onUserInteraction]);

  if (!items || items.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor }]}>
        <Icon name="movie-outline" size={56} color="#ffffff" style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>{t('components.mediaPlayer.title')}</Text>
        <Text style={styles.emptyText}>
          {t('components.mediaPlayer.noItemsConfigured')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        javaScriptEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={false}
        bounces={false}
        scrollEnabled={false}
        onMessage={handleMessage}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        domStorageEnabled={true}
      />
    </View>
  );
};

function generateEmptyHTML(bgColor: string): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{margin:0;padding:0}body{background:${bgColor};display:flex;align-items:center;justify-content:center;height:100vh;color:#fff;font-family:sans-serif;text-align:center}h1{font-size:48px;margin-bottom:16px}p{font-size:18px;opacity:0.7}</style></head><body><div><h1>🎬</h1><p>No media configured</p></div></body></html>`;
}

function generatePlayerHTML(settings: {
  items: MediaItem[];
  autoPlay: boolean;
  loop: boolean;
  shuffle: boolean;
  imageDuration: number;
  showControls: boolean;
  fitMode: MediaFitMode;
  backgroundColor: string;
  transitionEnabled: boolean;
  transitionDuration: number;
  muteVideo: boolean;
}): string {
  const {
    items,
    autoPlay,
    loop,
    shuffle,
    imageDuration,
    showControls,
    fitMode,
    backgroundColor,
    transitionEnabled,
    transitionDuration,
    muteVideo,
  } = settings;

  const itemsJSON = JSON.stringify(items.map(i => ({
    url: i.url,
    type: i.type,
    duration: i.duration || imageDuration,
    title: i.title || '',
  })));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { 
    width: 100%; height: 100%; overflow: hidden; 
    background: ${backgroundColor}; 
    -webkit-user-select: none; user-select: none;
    -webkit-touch-callout: none;
  }
  
  .player-container {
    width: 100%; height: 100%; position: relative;
  }
  
  .media-slot {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; justify-content: center; align-items: center;
    opacity: 0;
    pointer-events: none;
    ${transitionEnabled ? `transition: opacity ${transitionDuration}ms ease-in-out;` : ''}
  }
  .media-slot.active {
    opacity: 1;
    pointer-events: auto;
  }
  
  .media-slot video,
  .media-slot img {
    width: 100%; height: 100%;
    object-fit: ${fitMode};
    display: block;
  }
  
  /* Controls overlay */
  .controls-bar {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.8));
    padding: 16px 20px;
    display: ${showControls ? 'flex' : 'none'};
    align-items: center; justify-content: center; gap: 16px;
    z-index: 100;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .controls-bar.visible { opacity: 1; }
  
  .ctrl-btn {
    background: rgba(255,255,255,0.15);
    border: 2px solid rgba(255,255,255,0.3);
    color: white;
    width: 48px; height: 48px; border-radius: 50%;
    font-size: 18px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    transition: background 0.2s, transform 0.1s;
  }
  .ctrl-btn:active { 
    background: rgba(255,255,255,0.3); 
    transform: scale(0.92); 
  }
  .ctrl-btn.play-btn {
    width: 56px; height: 56px; font-size: 22px;
    border-color: rgba(255,255,255,0.5);
  }
  
  .progress-container {
    flex: 1; max-width: 200px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .progress-track {
    width: 100%; height: 3px;
    background: rgba(255,255,255,0.2);
    border-radius: 2px; overflow: hidden;
  }
  .progress-fill {
    height: 100%; background: #fff;
    border-radius: 2px; width: 0%;
    transition: width 0.5s linear;
  }
  .progress-label {
    color: rgba(255,255,255,0.8);
    font-size: 12px; font-family: monospace;
    letter-spacing: 0.5px;
  }
  
  /* Loading spinner */
  .loading-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: none; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.3); z-index: 50;
  }
  .loading-overlay.show { display: flex; }
  .spinner {
    width: 40px; height: 40px;
    border: 3px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  /* Error display */
  .error-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: none; align-items: center; justify-content: center;
    flex-direction: column; color: white; text-align: center;
    background: rgba(0,0,0,0.5); z-index: 40;
    font-family: sans-serif;
  }
  .error-overlay.show { display: flex; }
  .error-icon { font-size: 48px; margin-bottom: 12px; }
  .error-msg { font-size: 14px; opacity: 0.7; max-width: 80%; }
</style>
</head>
<body>
  <div class="player-container" id="playerContainer">
    <div class="media-slot" id="slotA"></div>
    <div class="media-slot" id="slotB"></div>
    <div class="loading-overlay" id="loadingOverlay"><div class="spinner"></div></div>
    <div class="error-overlay" id="errorOverlay">
      <div class="error-icon">⚠️</div>
      <div class="error-msg" id="errorMsg">Failed to load media</div>
    </div>
    <div class="controls-bar" id="controlsBar">
      <button class="ctrl-btn" id="prevBtn" onclick="player.prev()">⏮</button>
      <button class="ctrl-btn play-btn" id="playBtn" onclick="player.togglePlay()">⏸</button>
      <button class="ctrl-btn" id="nextBtn" onclick="player.next()">⏭</button>
      <div class="progress-container">
        <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
        <span class="progress-label" id="counterLabel">1 / 1</span>
      </div>
    </div>
  </div>
  
<script>
(function() {
  'use strict';
  
  var playlist = ${itemsJSON};
  var SETTINGS = {
    autoPlay: ${autoPlay},
    loop: ${loop},
    shuffle: ${shuffle},
    imageDuration: ${imageDuration},
    showControls: ${showControls},
    transitionEnabled: ${transitionEnabled},
    transitionDuration: ${transitionDuration},
    muteVideo: ${muteVideo}
  };
  
  // DOM refs
  var slotA = document.getElementById('slotA');
  var slotB = document.getElementById('slotB');
  var loadingEl = document.getElementById('loadingOverlay');
  var errorEl = document.getElementById('errorOverlay');
  var errorMsg = document.getElementById('errorMsg');
  var controlsBar = document.getElementById('controlsBar');
  var playBtn = document.getElementById('playBtn');
  var counterLabel = document.getElementById('counterLabel');
  var progressFill = document.getElementById('progressFill');
  
  // State
  var currentIndex = 0;
  var isPlaying = SETTINGS.autoPlay;
  var activeSlot = 'A';
  var imageTimer = null;
  var progressTimer = null;
  var progressStart = 0;
  var progressDuration = 0;
  var controlsTimer = null;
  var controlsVisible = false;
  var shuffleOrder = [];
  var errorRetryTimer = null;
  
  // Build shuffle order
  function buildShuffleOrder() {
    shuffleOrder = [];
    for (var i = 0; i < playlist.length; i++) shuffleOrder.push(i);
    for (var j = shuffleOrder.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = shuffleOrder[j];
      shuffleOrder[j] = shuffleOrder[k];
      shuffleOrder[k] = tmp;
    }
  }
  
  function getPlaylistIndex(idx) {
    if (SETTINGS.shuffle && shuffleOrder.length > 0) {
      return shuffleOrder[idx % shuffleOrder.length];
    }
    return idx % playlist.length;
  }
  
  function showLoading() { loadingEl.className = 'loading-overlay show'; }
  function hideLoading() { loadingEl.className = 'loading-overlay'; }
  function showError(msg) { errorMsg.textContent = msg; errorEl.className = 'error-overlay show'; }
  function hideError() { errorEl.className = 'error-overlay'; }
  
  function updateControls() {
    if (!SETTINGS.showControls) return;
    var realIdx = getPlaylistIndex(currentIndex);
    counterLabel.textContent = (realIdx + 1) + ' / ' + playlist.length;
    playBtn.textContent = isPlaying ? '⏸' : '▶';
  }
  
  function showControlsBar() {
    if (!SETTINGS.showControls) return;
    controlsBar.className = 'controls-bar visible';
    controlsVisible = true;
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(function() {
      if (isPlaying) {
        controlsBar.className = 'controls-bar';
        controlsVisible = false;
      }
    }, 3000);
  }
  
  function startProgress(durationSec) {
    progressFill.style.transition = 'none';
    progressFill.style.width = '0%';
    progressStart = Date.now();
    progressDuration = durationSec * 1000;
    
    // Force reflow then animate
    void progressFill.offsetWidth;
    progressFill.style.transition = 'width ' + durationSec + 's linear';
    progressFill.style.width = '100%';
  }
  
  function stopProgress() {
    progressFill.style.transition = 'none';
    progressFill.style.width = '0%';
  }
  
  function clearTimers() {
    if (imageTimer) { clearTimeout(imageTimer); imageTimer = null; }
    if (errorRetryTimer) { clearTimeout(errorRetryTimer); errorRetryTimer = null; }
    stopProgress();
  }
  
  function getActiveSlot() { return activeSlot === 'A' ? slotA : slotB; }
  function getInactiveSlot() { return activeSlot === 'A' ? slotB : slotA; }
  
  function swapSlots() {
    var active = getActiveSlot();
    var inactive = getInactiveSlot();
    inactive.classList.add('active');
    active.classList.remove('active');
    activeSlot = activeSlot === 'A' ? 'B' : 'A';
    
    // Clean old slot after transition
    setTimeout(function() {
      active.innerHTML = '';
    }, SETTINGS.transitionEnabled ? SETTINGS.transitionDuration + 100 : 50);
  }
  
  function loadMedia(index) {
    if (playlist.length === 0) return;
    
    var realIdx = getPlaylistIndex(index);
    var item = playlist[realIdx];
    if (!item) return;
    
    clearTimers();
    hideError();
    
    var slot = getInactiveSlot();
    slot.innerHTML = '';
    
    if (item.type === 'video') {
      loadVideo(slot, item, realIdx);
    } else {
      loadImage(slot, item, realIdx);
    }
    
    updateControls();
  }
  
  function loadVideo(slot, item, realIdx) {
    showLoading();
    var video = document.createElement('video');
    video.src = item.url;
    video.autoplay = isPlaying;
    video.muted = SETTINGS.muteVideo;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    
    video.addEventListener('loadeddata', function() {
      hideLoading();
      swapSlots();
      if (isPlaying && SETTINGS.showControls) {
        startProgress(video.duration || 0);
      }
    });
    
    video.addEventListener('ended', function() {
      stopProgress();
      if (isPlaying) {
        advanceToNext();
      }
    });
    
    video.addEventListener('error', function(e) {
      hideLoading();
      showError('Failed to load video: ' + item.url);
      errorRetryTimer = setTimeout(function() {
        hideError();
        advanceToNext();
      }, 3000);
    });
    
    video.addEventListener('timeupdate', function() {
      if (SETTINGS.showControls && video.duration) {
        var pct = (video.currentTime / video.duration) * 100;
        progressFill.style.transition = 'none';
        progressFill.style.width = pct + '%';
      }
    });
    
    slot.appendChild(video);
  }
  
  function loadImage(slot, item, realIdx) {
    showLoading();
    var img = document.createElement('img');
    img.src = item.url;
    img.draggable = false;
    
    var dur = item.duration || SETTINGS.imageDuration;
    
    img.addEventListener('load', function() {
      hideLoading();
      swapSlots();
      
      if (isPlaying) {
        if (SETTINGS.showControls) startProgress(dur);
        imageTimer = setTimeout(function() {
          advanceToNext();
        }, dur * 1000);
      }
    });
    
    img.addEventListener('error', function() {
      hideLoading();
      showError('Failed to load image: ' + item.url);
      errorRetryTimer = setTimeout(function() {
        hideError();
        advanceToNext();
      }, 3000);
    });
    
    slot.appendChild(img);
  }
  
  function advanceToNext() {
    var nextIdx = currentIndex + 1;
    if (nextIdx >= playlist.length) {
      if (SETTINGS.loop) {
        if (SETTINGS.shuffle) buildShuffleOrder();
        nextIdx = 0;
      } else {
        isPlaying = false;
        updateControls();
        return;
      }
    }
    currentIndex = nextIdx;
    loadMedia(currentIndex);
  }
  
  function advanceToPrev() {
    var prevIdx = currentIndex - 1;
    if (prevIdx < 0) {
      if (SETTINGS.loop) {
        prevIdx = playlist.length - 1;
      } else {
        return;
      }
    }
    currentIndex = prevIdx;
    loadMedia(currentIndex);
  }
  
  // Public API
  window.player = {
    togglePlay: function() {
      isPlaying = !isPlaying;
      var slot = getActiveSlot();
      var video = slot.querySelector('video');
      if (video) {
        if (isPlaying) {
          video.play().catch(function(){});
        } else {
          video.pause();
        }
      } else if (isPlaying) {
        // Image: restart timer
        var realIdx = getPlaylistIndex(currentIndex);
        var item = playlist[realIdx];
        var dur = (item && item.duration) || SETTINGS.imageDuration;
        if (SETTINGS.showControls) startProgress(dur);
        imageTimer = setTimeout(function() { advanceToNext(); }, dur * 1000);
      } else {
        clearTimers();
      }
      updateControls();
      showControlsBar();
    },
    next: function() {
      advanceToNext();
      showControlsBar();
    },
    prev: function() {
      advanceToPrev();
      showControlsBar();
    }
  };
  
  // Touch/click interactions
  document.addEventListener('click', function(e) {
    // Report interaction to React Native
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'interaction',
        isTap: true,
        x: e.clientX,
        y: e.clientY
      }));
    }
    
    // Toggle controls visibility
    if (SETTINGS.showControls) {
      if (controlsVisible) {
        controlsBar.className = 'controls-bar';
        controlsVisible = false;
      } else {
        showControlsBar();
      }
    }
  });
  
  // Initialize
  if (SETTINGS.shuffle) buildShuffleOrder();
  
  // Load first item directly into slot A
  if (playlist.length > 0) {
    var firstRealIdx = getPlaylistIndex(0);
    var firstItem = playlist[firstRealIdx];
    
    if (firstItem.type === 'video') {
      var video = document.createElement('video');
      video.src = firstItem.url;
      video.autoplay = isPlaying;
      video.muted = SETTINGS.muteVideo;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'auto';
      
      video.addEventListener('loadeddata', function() {
        hideLoading();
        slotA.classList.add('active');
        if (isPlaying && SETTINGS.showControls) {
          startProgress(video.duration || 0);
        }
      });
      video.addEventListener('ended', function() {
        stopProgress();
        if (isPlaying) advanceToNext();
      });
      video.addEventListener('error', function() {
        hideLoading();
        showError('Failed to load video: ' + firstItem.url);
        errorRetryTimer = setTimeout(function() { hideError(); advanceToNext(); }, 3000);
      });
      video.addEventListener('timeupdate', function() {
        if (SETTINGS.showControls && video.duration) {
          var pct = (video.currentTime / video.duration) * 100;
          progressFill.style.transition = 'none';
          progressFill.style.width = pct + '%';
        }
      });
      
      showLoading();
      slotA.appendChild(video);
    } else {
      var img = document.createElement('img');
      img.src = firstItem.url;
      img.draggable = false;
      var initDur = firstItem.duration || SETTINGS.imageDuration;
      
      img.addEventListener('load', function() {
        hideLoading();
        slotA.classList.add('active');
        if (isPlaying) {
          if (SETTINGS.showControls) startProgress(initDur);
          imageTimer = setTimeout(function() { advanceToNext(); }, initDur * 1000);
        }
      });
      img.addEventListener('error', function() {
        hideLoading();
        showError('Failed to load image: ' + firstItem.url);
        errorRetryTimer = setTimeout(function() { hideError(); advanceToNext(); }, 3000);
      });
      
      showLoading();
      slotA.appendChild(img);
    }
    
    updateControls();
  }
})();
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default MediaPlayerComponent;
