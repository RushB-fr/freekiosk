import React, { useRef, useState, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Animated,
  Image,
  ScrollView,
  Linking
} from 'react-native';

import { WebView } from 'react-native-webview';
import type { WebViewErrorEvent, ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useNavigation } from '@react-navigation/native';
import PrintModule from '../utils/PrintModule';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface WebViewComponentProps {
  url: string;
  autoReload: boolean;
  keyboardMode?: string; // 'default', 'force_numeric', 'smart'
  onUserInteraction?: (event?: { isTap?: boolean; x?: number; y?: number }) => void; // callback optionnel pour interaction utilisateur
  jsToExecute?: string; // JavaScript code to execute from API
  onJsExecuted?: () => void; // callback when JS is executed
  showBackButton?: boolean; // Enable web navigation back button
  onNavigationStateChange?: (canGoBack: boolean) => void; // Callback for web navigation state
  onPageNavigated?: (url: string) => void; // Callback when page URL changes (for inactivity return)
  urlFilterMode?: string; // 'whitelist' or 'blacklist'
  urlFilterPatterns?: string[]; // URL patterns to filter
  urlFilterShowFeedback?: boolean; // Show feedback when URL is blocked
  pdfViewerEnabled?: boolean; // Enable inline PDF viewing via PDF.js
}

export interface WebViewComponentRef {
  goBack: () => void;
  scrollToTop: () => void;
  clearCache: () => void;
}

const WebViewComponent = forwardRef<WebViewComponentRef, WebViewComponentProps>(({ 
  url, 
  autoReload,
  keyboardMode = 'default',
  onUserInteraction,
  jsToExecute,
  onJsExecuted,
  showBackButton = false,
  onNavigationStateChange,
  onPageNavigated,
  urlFilterMode,
  urlFilterPatterns,
  urlFilterShowFeedback = false,
  pdfViewerEnabled = false
}, ref) => {
  const navigation = useNavigation<NavigationProp>();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [pageLoaded, setPageLoaded] = useState<boolean>(false);
  const [blockedUrlMessage, setBlockedUrlMessage] = useState<string | null>(null);
  const blockedUrlTimerRef = useRef<any>(null);
  const isGoingBackRef = useRef<boolean>(false); // Prevent goBack loop for URL filter
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const loadingTimeoutRef = useRef<any>(null);

  // Pre-compile URL filter patterns into RegExp for performance
  const compiledFilterPatterns = useMemo(() => {
    if (!urlFilterPatterns || urlFilterPatterns.length === 0) return [];
    return urlFilterPatterns.map(pattern => {
      try {
        // Strip leading/trailing whitespace
        let p = pattern.trim();
        if (!p) return null;

        // Escape regex special chars except *, then convert * to .*
        const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');

        // If the pattern already starts with a protocol (http/https), anchor it
        // Otherwise, allow any protocol prefix and make trailing slash optional
        const hasProtocol = /^https?:\/\//i.test(p);
        if (hasProtocol) {
          // Exact match with optional trailing slash
          return new RegExp(`^${escaped}\\/?$`, 'i');
        } else {
          // No protocol: allow https?:// prefix, optional trailing slash
          return new RegExp(`^https?:\\/\\/${escaped}\\/?$`, 'i');
        }
      } catch {
        return null;
      }
    }).filter(Boolean) as RegExp[];
  }, [urlFilterPatterns]);

  // Check if a URL should be blocked by the filter
  const isUrlBlocked = useCallback((targetUrl: string): boolean => {
    if (!urlFilterMode) return false;

    // Blacklist with empty list = nothing to block
    if (urlFilterMode === 'blacklist' && compiledFilterPatterns.length === 0) return false;

    // Helper: extract origin + pathname (without query/hash), normalize trailing slash
    const getOriginPath = (u: string): string => {
      const m = u.match(/^(https?:\/\/[^/?#]+)([^?#]*)/i);
      if (!m) return u.toLowerCase();
      let path = m[2] || '/';
      // Normalize: add leading /, remove trailing / (except for root)
      if (!path.startsWith('/')) path = '/' + path;
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      return (m[1] + path).toLowerCase();
    };

    // Always allow navigation to the same page (same origin + path)
    // This allows form submits, JS buttons, hash/query changes on the SAME page
    const targetOriginPath = getOriginPath(targetUrl);
    const mainOriginPath = getOriginPath(url);
    
    if (targetOriginPath === mainOriginPath) return false;

    if (urlFilterMode === 'blacklist') {
      // Blacklist: block if URL matches any pattern
      return compiledFilterPatterns.some(regex => regex.test(targetUrl));
    } else {
      // Whitelist: block everything except same-page + matched patterns
      // Empty list = only same-page allowed (strictest mode)
      if (compiledFilterPatterns.length === 0) return true;
      // Check if target matches any whitelist pattern
      if (compiledFilterPatterns.some(regex => regex.test(targetUrl))) return false;
      // No match = blocked
      return true;
    }
  }, [urlFilterMode, compiledFilterPatterns, url]);

  // Show brief feedback when URL is blocked
  const showBlockedFeedback = useCallback((blockedUrl: string) => {
    if (!urlFilterShowFeedback) return;
    // Extract hostname from URL using regex (avoid URL constructor type issues in RN)
    const hostMatch = blockedUrl.match(/^https?:\/\/([^/]+)/);
    const hostname = hostMatch ? hostMatch[1] : blockedUrl;
    setBlockedUrlMessage(`🚫 ${hostname}`);
    if (blockedUrlTimerRef.current) clearTimeout(blockedUrlTimerRef.current);
    blockedUrlTimerRef.current = setTimeout(() => setBlockedUrlMessage(null), 2000);
  }, [urlFilterShowFeedback]);

  // Expose goBack, scrollToTop, and clearCache methods to parent via ref
  useImperativeHandle(ref, () => ({
    goBack: () => {
      if (webViewRef.current) {
        webViewRef.current.goBack();
      }
    },
    scrollToTop: () => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript('window.scrollTo({top: 0, behavior: "smooth"}); true;');
      }
    },
    clearCache: () => {
      if (webViewRef.current) {
        webViewRef.current.clearCache(true);
        console.log('[WebView] Cache cleared via ref');
      }
    }
  }));

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Execute JavaScript from API
  React.useEffect(() => {
    if (jsToExecute && webViewRef.current && !loading) {
      webViewRef.current.injectJavaScript(jsToExecute);
      console.log('[WebView] Executed JS from API');
      if (onJsExecuted) {
        onJsExecuted();
      }
    }
  }, [jsToExecute, loading, onJsExecuted]);

  // Cleanup loading timeout on unmount
  React.useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Injection JS pour détecter les clics dans la webview
  // Optimisé pour Fire OS : throttling des événements, protection double-init
  const injectedJavaScript = `
    (function() {
    // Protection contre double exécution (important pour Fire OS)
    if (window.__FREEKIOSK_INITIALIZED__) {
      return;
    }
    window.__FREEKIOSK_INITIALIZED__ = true;

    // Ensure storage is working properly
    try {
      localStorage.setItem('__test__', '1');
      localStorage.removeItem('__test__');
    } catch(e) {
      console.error('[FreeKiosk] localStorage FAILED:', e);
    }

    // Intercept window.print() to use native Android print
    window.print = function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PRINT_REQUEST',
        title: document.title || ''
      }));
    };

    // Throttling pour éviter le flood de messages (critique sur Fire OS)
    let lastInteraction = 0;
    const THROTTLE_MS = 200; // Max 5 messages/sec

    function sendInteraction() {
      const now = Date.now();
      if (now - lastInteraction > THROTTLE_MS) {
        window.ReactNativeWebView.postMessage('user-interaction');
        lastInteraction = now;
      }
    }

    // Tap detection for 5-tap - Use touchend on mobile (click doesn't always fire)
    // Send coordinates for spatial proximity detection
    document.addEventListener('touchend', function(e) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        var touch = e.changedTouches[0];
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'FIVE_TAP_CLICK',
          x: touch.clientX,
          y: touch.clientY
        }));
      }
    }, true);
    
    // Click handler for desktop/fallback - Also send user-interaction for screensaver reset
    document.addEventListener('click', function(e) {
      sendInteraction();
    }, true);

    // Scroll avec throttling (évite 50+ msg/sec)
    document.addEventListener('scroll', sendInteraction, true);

    // Touch events avec throttling (for screensaver only, not for tap counting)
    document.addEventListener('touchstart', sendInteraction, true);
    document.addEventListener('touchmove', sendInteraction, true);

    // PDF link interception: prevent <a download href="...pdf"> from triggering
    // the native Android DownloadManager — instead force a real navigation so
    // onShouldStartLoadWithRequest can redirect to the local PDF viewer.
    if (${pdfViewerEnabled ? 'true' : 'false'}) {
      function interceptPdfLinks() {
        document.querySelectorAll('a[href]').forEach(function(a) {
          if (a.__pdfIntercepted) return;
          var href = (a.getAttribute('href') || '').toLowerCase().split('?')[0].split('#')[0];
          var hasDownload = a.hasAttribute('download');
          if (href.endsWith('.pdf') || hasDownload) {
            a.__pdfIntercepted = true;
            // Strip the download attribute so Android doesn't trigger the DownloadManager
            a.removeAttribute('download');
          }
        });
      }
      // Run immediately and watch for DOM changes (SPAs)
      interceptPdfLinks();
      var pdfObserver = new MutationObserver(interceptPdfLinks);
      pdfObserver.observe(document.body, { childList: true, subtree: true });
    }
  })();
  true;
  `;

  // Script d'injection pour forcer le clavier numérique
  const getKeyboardModeScript = (): string => {
    if (keyboardMode === 'default') {
      return '';
    }

    if (keyboardMode === 'force_numeric') {
      return `
        (function() {
          function forceNumericKeyboard() {
            const inputs = document.querySelectorAll('input');
            inputs.forEach(input => {
              // Ne pas modifier les types spéciaux
              const type = input.type.toLowerCase();
              if (type !== 'hidden' && type !== 'submit' && type !== 'button' && type !== 'checkbox' && type !== 'radio') {
                input.setAttribute('inputmode', 'numeric');
                input.setAttribute('pattern', '[0-9]*');
              }
            });
          }
          
          // Appliquer immédiatement
          forceNumericKeyboard();
          
          // Observer les changements du DOM
          const observer = new MutationObserver(forceNumericKeyboard);
          observer.observe(document.body, { childList: true, subtree: true });
        })();
      `;
    }

    if (keyboardMode === 'smart') {
      return `
        (function() {
          function smartDetectNumeric() {
            const inputs = document.querySelectorAll('input');
            inputs.forEach(input => {
              const type = input.type.toLowerCase();
              const name = (input.name || '').toLowerCase();
              const id = (input.id || '').toLowerCase();
              const placeholder = (input.placeholder || '').toLowerCase();
              const className = (input.className || '').toLowerCase();
              
              // Détecter les champs numériques
              const isNumericType = type === 'number' || type === 'tel';
              const hasNumericPattern = input.pattern && /[0-9]/.test(input.pattern);
              const hasNumericName = /price|quantity|qty|amount|number|num|phone|tel|code|zip|postal|card/.test(name + id + placeholder + className);
              
              if (isNumericType || hasNumericPattern || hasNumericName) {
                input.setAttribute('inputmode', 'numeric');
                input.setAttribute('pattern', '[0-9]*');
              }
            });
          }
          
          // Appliquer immédiatement
          smartDetectNumeric();
          
          // Observer les changements du DOM
          const observer = new MutationObserver(smartDetectNumeric);
          observer.observe(document.body, { childList: true, subtree: true });
        })();
      `;
    }

    return '';
  };

  const combinedInjectedJavaScript = injectedJavaScript + getKeyboardModeScript();

  // Gestion des messages venant de la webview
  const onMessageHandler = (event: any) => {
    const message = event.nativeEvent.data;
    
    if (message === 'user-interaction' && onUserInteraction) {
      onUserInteraction();
    } else if (message.startsWith('{')) {
      // Parse JSON message
      try {
        const data = JSON.parse(message);
        if (data.type === 'FIVE_TAP_CLICK' && onUserInteraction) {
          onUserInteraction({ isTap: true, x: data.x, y: data.y });
        } else if (data.type === 'PRINT_REQUEST') {
          // Handle print request from window.print()
          PrintModule.printWebView(data.title || 'FreeKiosk Print')
            .then(() => console.log('[WebView] Print job started'))
            .catch((err: any) => console.error('[WebView] Print failed:', err));
        } else if (data.type === 'PDF_VIEWER_CLOSE') {
          // User closed PDF viewer, go back to previous page
          if (webViewRef.current) {
            webViewRef.current.goBack();
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    } else if (message === 'FIVE_TAP_CLICK' && onUserInteraction) {
      // Legacy: Dedicated tap event for 5-tap detection (no coordinates)
      onUserInteraction({ isTap: true });
    }
  };

  const handleError = (event: WebViewErrorEvent): void => {
    console.error('[FreeKiosk] WebView error:', event.nativeEvent);
    setError(true);
    setLoading(false);
    
    // Load about:blank to clear the native Android error page
    // This is the ONLY way to prevent the native WebView error page from covering our overlay
    webViewRef.current?.injectJavaScript('window.location.href = "about:blank"; true;');
    
    if (autoReload) {
      setTimeout(() => {
        setError(false);
        setLoading(true);
        setPageLoaded(false);
      }, 5000);
    }
  };

  const handleHttpError = (event: any): void => {
    console.error('[FreeKiosk] HTTP Error:', event.nativeEvent.statusCode, event.nativeEvent.url);
  };

  const handleReload = (): void => {
    setError(false);
    setLoading(true);
    setPageLoaded(false);
  };

  const handleNavigateToSettings = (): void => {
    navigation.navigate('Pin');
  };

  const handleOpenGitHub = (): void => {
    Linking.openURL('https://github.com/rushb-fr/freekiosk').catch(err =>
      console.error('[FreeKiosk] Failed to open GitHub URL:', err)
    );
  };

  if (!url) {
    return (
      <View style={styles.welcomeContainer}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.welcomeContent, { opacity: fadeAnim }]}>
              
              {/* Logo / Icon */}
            <View style={styles.logoContainer}>
              <View style={styles.logoCircle}>
                <Image 
                  source={require('../assets/images/logo_circle.png')} 
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* Title */}
            <Text style={styles.welcomeTitle}>FreeKiosk</Text>
            <Text style={styles.welcomeSubtitle}>
              Professional Kiosk Application
            </Text>

            {/* Features List */}
            <View style={styles.featuresList}>
              <FeatureItem
                icon="🔒"
                text="Secure kiosk mode"
              />
              <FeatureItem
                icon="⚡"
                text="Optimal performance"
              />
              <FeatureItem
                icon="🎯"
                text="100% free & open source"
              />
            </View>

            {/* Action Button */}
            <TouchableOpacity
              style={styles.setupButton}
              onPress={handleNavigateToSettings}
              activeOpacity={0.8}
            >
              <Text style={styles.setupButtonText}>
                🚀 Start Configuration
              </Text>
            </TouchableOpacity>

            {/* GitHub Support Button */}
            <TouchableOpacity
              style={styles.githubButton}
              onPress={handleOpenGitHub}
              activeOpacity={0.7}
            >
              <Text style={styles.githubButtonText}>
                ⭐ Support us on GitHub
              </Text>
            </TouchableOpacity>

            {/* Hint */}
            <View style={styles.hintContainer}>
              <Text style={styles.hintText}>
                💡 Tip: Tap 5× anywhere on the screen to access settings
              </Text>
            </View>

            {/* Footer */}
            <Text style={styles.footerText}>
              Version 1.2.12 • by Rushb
            </Text>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: error ? 'about:blank' : url }}
        style={styles.webview}
        
        // User Agent - Mimic Chrome to ensure proper storage APIs
        userAgent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        
        originWhitelist={pdfViewerEnabled ? ['http://*', 'https://*', 'file://*'] : ['http://*', 'https://*']}
        mixedContentMode="always"
        onHttpError={handleHttpError}

        onLoadStart={() => {
          // Don't reset error state when loading about:blank (error recovery)
          if (!error) {
            setLoading(true);
            setPageLoaded(false);
          }

          // Clear any existing timeout
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }

          // Fire OS/Fire Tablet workaround: Force hide loading spinner after 10s
          // This handles cases where onLoadEnd doesn't fire on SPAs or redirects
          if (!error) {
            loadingTimeoutRef.current = setTimeout(() => {
              setLoading(false);
            }, 10000);
          }
        }}
        onLoadEnd={() => {
          // Don't mark as loaded when loading about:blank during error state
          if (!error) {
            setLoading(false);
            setPageLoaded(true);
          }

          // Clear timeout since load completed normally
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        }}
        onLoadProgress={({ nativeEvent }) => {
          // For SPAs like Nuxt/Home Assistant, hide spinner when fully loaded
          if (nativeEvent.progress === 1 && !error) {
            setLoading(false);
            setPageLoaded(true);

            // Clear timeout since we've reached 100%
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
          }
        }}
        onError={handleError}

        javaScriptEnabled={true}
        domStorageEnabled={true}
        injectedJavaScript={combinedInjectedJavaScript}

        onMessage={onMessageHandler}

        startInLoadingState={true}

        onShouldStartLoadWithRequest={(request: ShouldStartLoadRequest) => {
          // Security: Block dangerous URL schemes
          const urlLower = request.url.toLowerCase();
          
          // Allow file:// only for our bundled PDF viewer
          if (urlLower.startsWith('file:///android_asset/pdfjs/')) {
            return true;
          }
          
          if (urlLower.startsWith('file://') ||
              urlLower.startsWith('javascript:') ||
              urlLower.startsWith('data:')) {
            console.warn('[FreeKiosk] Blocked dangerous URL scheme:', request.url);
            return false;
          }

          // PDF Viewer: intercept PDF links and redirect to local viewer
          if (pdfViewerEnabled && request.isTopFrame) {
            // Check direct PDF URLs (path ends with .pdf)
            const urlPath = urlLower.split('?')[0].split('#')[0];
            let pdfUrl: string | null = null;

            if (urlPath.endsWith('.pdf')) {
              pdfUrl = request.url;
            }

            // Check Google redirect URLs: google.com/url?...url=<pdf_url>...
            if (!pdfUrl && (urlLower.includes('google.com/url?') || urlLower.includes('google.com/url&'))) {
              try {
                const queryStart = request.url.indexOf('?');
                if (queryStart !== -1) {
                  const queryStr = request.url.substring(queryStart + 1);
                  const params = queryStr.split('&');
                  for (const param of params) {
                    const [key, ...valueParts] = param.split('=');
                    if (key === 'url' || key === 'q') {
                      const targetUrl = decodeURIComponent(valueParts.join('='));
                      const targetPath = targetUrl.toLowerCase().split('?')[0].split('#')[0];
                      if (targetPath.endsWith('.pdf')) {
                        pdfUrl = targetUrl;
                        break;
                      }
                    }
                  }
                }
              } catch (e) {
                // Invalid URL, ignore
              }
            }

            if (pdfUrl) {
              console.log('[FreeKiosk] PDF detected, opening in viewer:', pdfUrl);
              const viewerUrl = `file:///android_asset/pdfjs/viewer.html?file=${encodeURIComponent(pdfUrl)}`;
              if (webViewRef.current) {
                webViewRef.current.injectJavaScript(
                  `window.location.href = ${JSON.stringify(viewerUrl)}; true;`
                );
              }
              return false;
            }
          }

          // URL Filtering (blacklist/whitelist)
          if (isUrlBlocked(request.url)) {
            showBlockedFeedback(request.url);
            return false;
          }

          return true;
        }}

        onNavigationStateChange={(navState) => {
          // Track web navigation state (for back button)
          if (showBackButton && onNavigationStateChange) {
            onNavigationStateChange(navState.canGoBack);
          }
          // Report URL changes for inactivity return feature
          if (onPageNavigated && navState.url) {
            onPageNavigated(navState.url);
          }
          // URL Filtering: catch SPA/client-side navigations (pushState, router.push)
          // that don't trigger onShouldStartLoadWithRequest
          if (navState.url && !isGoingBackRef.current && isUrlBlocked(navState.url)) {
            showBlockedFeedback(navState.url);
            // Navigate back to cancel the SPA navigation
            isGoingBackRef.current = true;
            if (webViewRef.current) {
              webViewRef.current.goBack();
            }
            // Reset guard after a short delay
            setTimeout(() => { isGoingBackRef.current = false; }, 500);
          }
        }}

        scalesPageToFit={true}
        cacheEnabled={true}
        incognito={false}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        
        // Storage settings for Pinia/Nuxt compatibility
        cacheMode="LOAD_DEFAULT"
        
        // Allow popups/new windows - required for some login flows
        // Instead of opening a new window, we redirect in the same WebView
        setSupportMultipleWindows={true}
        onOpenWindow={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          // URL Filtering: block popups to filtered URLs
          if (nativeEvent.targetUrl && isUrlBlocked(nativeEvent.targetUrl)) {
            showBlockedFeedback(nativeEvent.targetUrl);
            return;
          }
          // Load the URL in the same WebView instead of opening a popup
          if (webViewRef.current && nativeEvent.targetUrl) {
            webViewRef.current.injectJavaScript(
              `window.location.href = ${JSON.stringify(nativeEvent.targetUrl)};`
            );
          }
        }}

        // Security: File access disabled by default.
        // When PDF viewer is enabled, allow file access for loading bundled PDF.js from assets
        // and allow universal access so PDF.js can fetch remote PDF files.
        allowFileAccess={pdfViewerEnabled}
        allowUniversalAccessFromFileURLs={pdfViewerEnabled}
        allowFileAccessFromFileURLs={pdfViewerEnabled}

        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}

        // Kiosk mode: auto-grant camera/microphone permissions to web pages.
        // On Android this is handled by our RNCWebChromeClient patch (auto-grant in onPermissionRequest).
        // On iOS this prop handles it natively.
        mediaCapturePermissionGrantType="grant"
      />
      
      {loading && !error && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066cc" />
          <Text style={styles.loadingText}>Loading...</Text>
          {/* Fallback settings button inside loading overlay */}
          <TouchableOpacity
            style={styles.fallbackSettingsButton}
            activeOpacity={0.7}
            onPress={() => {
              if (onUserInteraction) {
                onUserInteraction({ isTap: true, x: 0, y: 0 });
              }
            }}
          >
            <Text style={styles.fallbackSettingsButtonText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>Loading Error</Text>
          <Text style={styles.errorSubtext}>URL: {url}</Text>
          {autoReload && (
            <Text style={styles.helpText}>
              Automatic reload in 5 seconds...
            </Text>
          )}
          <TouchableOpacity style={styles.reloadButton} onPress={handleReload}>
            <Text style={styles.reloadText}>🔄 Reload Now</Text>
          </TouchableOpacity>
          {/* Fallback settings button inside error overlay */}
          <TouchableOpacity
            style={styles.fallbackSettingsButton}
            activeOpacity={0.7}
            onPress={() => {
              if (onUserInteraction) {
                onUserInteraction({ isTap: true, x: 0, y: 0 });
              }
            }}
          >
            <Text style={styles.fallbackSettingsButtonText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      )}

      {blockedUrlMessage && (
        <View style={styles.blockedToast}>
          <Text style={styles.blockedToastText}>{blockedUrlMessage}</Text>
        </View>
      )}
    </View>
  );
});


const FeatureItem: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <View style={styles.featureItem}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);


const styles = StyleSheet.create({
  // WELCOME SCREEN STYLES
  welcomeContainer: {
    flex: 1,
    backgroundColor: '#0066cc',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  welcomeContent: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 32,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  logoImage: {
    width: 80,
    height: 80,
    tintColor: undefined,
  },
  welcomeTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 48,
    textAlign: 'center',
  },
  featuresList: {
    width: '100%',
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  featureText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    flex: 1,
  },
  setupButton: {
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 24,
  },
  setupButtonText: {
    color: '#0066cc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hintContainer: {
    marginTop: 8,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  hintText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 18,
  },
  githubButton: {
    marginTop: 20,
    marginBottom: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
  },
  githubButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    marginTop: 32,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },

  // WEBVIEW STYLES
  container: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  webview: { 
    flex: 1 
  },
  loadingContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: { 
    marginTop: 10, 
    fontSize: 16, 
    color: '#666' 
  },
  errorContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: { 
    fontSize: 18, 
    color: '#333', 
    marginBottom: 10, 
    textAlign: 'center', 
    fontWeight: 'bold' 
  },
  errorSubtext: { 
    fontSize: 14, 
    color: '#666', 
    marginBottom: 10, 
    textAlign: 'center' 
  },
  helpText: { 
    fontSize: 14, 
    color: '#666', 
    marginBottom: 20, 
    textAlign: 'center' 
  },
  reloadButton: { 
    backgroundColor: '#0066cc', 
    paddingHorizontal: 30, 
    paddingVertical: 15, 
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  reloadText: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  blockedToast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  blockedToastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  fallbackSettingsButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  fallbackSettingsButtonText: {
    fontSize: 20,
    opacity: 0,
  },
});

WebViewComponent.displayName = 'WebViewComponent';

export default WebViewComponent;