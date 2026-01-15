import React, { useRef, useState } from 'react';
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface WebViewComponentProps {
  url: string;
  autoReload: boolean;
  keyboardMode?: string; // 'default', 'force_numeric', 'smart'
  onUserInteraction?: () => void; // callback optionnel pour interaction utilisateur
  jsToExecute?: string; // JavaScript code to execute from API
  onJsExecuted?: () => void; // callback when JS is executed
}

const WebViewComponent: React.FC<WebViewComponentProps> = ({ 
  url, 
  autoReload,
  keyboardMode = 'default',
  onUserInteraction,
  jsToExecute,
  onJsExecuted
}) => {
  const navigation = useNavigation<NavigationProp>();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const loadingTimeoutRef = useRef<any>(null);

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

    // Click handler - DO NOT intercept <a> tags to support SPA routing (Home Assistant, etc.)
    // Only send interaction message without preventing default behavior
    document.addEventListener('click', function(e) {
      sendInteraction();
    }, true);

    // Scroll avec throttling (évite 50+ msg/sec)
    document.addEventListener('scroll', sendInteraction, true);

    // Touch events avec throttling
    document.addEventListener('touchstart', sendInteraction, true);
    document.addEventListener('touchmove', sendInteraction, true);
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
    if (event.nativeEvent.data === 'user-interaction' && onUserInteraction) {
      onUserInteraction();
    }
  };

  const handleError = (event: WebViewErrorEvent): void => {
    console.error('[FreeKiosk] WebView error:', event.nativeEvent);
    setError(true);
    setLoading(false);
    
    if (autoReload) {
      setTimeout(() => {
        webViewRef.current?.reload();
        setError(false);
      }, 5000);
    }
  };

  const handleHttpError = (event: any): void => {
    console.error('[FreeKiosk] HTTP Error:', event.nativeEvent.statusCode, event.nativeEvent.url);
  };

  const handleReload = (): void => {
    setError(false);
    setLoading(true);
    webViewRef.current?.reload();
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
                💡 Tip: Tap 5× on the secret button to access settings (default: bottom-right corner)
              </Text>
            </View>

            {/* Footer */}
            <Text style={styles.footerText}>
              Version 1.2.0 • by Rushb
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
        source={{ uri: url }}
        style={styles.webview}
        
        // User Agent - Mimic Chrome to ensure proper storage APIs
        userAgent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        
        originWhitelist={['http://*', 'https://*']}
        mixedContentMode="always"
        onHttpError={handleHttpError}

        onLoadStart={() => {
          setLoading(true);
          setError(false);

          // Clear any existing timeout
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }

          // Fire OS/Fire Tablet workaround: Force hide loading spinner after 10s
          // This handles cases where onLoadEnd doesn't fire on SPAs or redirects
          loadingTimeoutRef.current = setTimeout(() => {
            setLoading(false);
          }, 10000);
        }}
        onLoadEnd={() => {
          setLoading(false);

          // Clear timeout since load completed normally
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        }}
        onLoadProgress={({ nativeEvent }) => {
          // For SPAs like Nuxt/Home Assistant, hide spinner when fully loaded
          if (nativeEvent.progress === 1) {
            setLoading(false);

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
          if (urlLower.startsWith('file://') ||
              urlLower.startsWith('javascript:') ||
              urlLower.startsWith('data:')) {
            console.warn('[FreeKiosk] Blocked dangerous URL scheme:', request.url);
            return false;
          }

          return true;
        }}

        onNavigationStateChange={(navState) => {
          // Navigation state tracking
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
          // Load the URL in the same WebView instead of opening a popup
          if (webViewRef.current && nativeEvent.targetUrl) {
            webViewRef.current.injectJavaScript(
              `window.location.href = ${JSON.stringify(nativeEvent.targetUrl)};`
            );
          }
        }}

        // Security: Disable file access to prevent reading local files
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        allowFileAccessFromFileURLs={false}

        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
      />
      
      {loading && !error && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066cc" />
          <Text style={styles.loadingText}>Loading...</Text>
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
        </View>
      )}
    </View>
  );
};


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
});

export default WebViewComponent;