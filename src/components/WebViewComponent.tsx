import React, { useRef, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  Text, 
  TouchableOpacity,
  Animated,
  Image,
  ScrollView
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
  onUserInteraction?: () => void; // callback optionnel pour interaction utilisateur
}

const WebViewComponent: React.FC<WebViewComponentProps> = ({ 
  url, 
  autoReload,
  onUserInteraction
}) => {
  const navigation = useNavigation<NavigationProp>();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Injection JS pour détecter les clics dans la webview
  // Optimisé pour Fire OS : throttling des événements, protection double-init
  const injectedJavaScript = `
    (function() {
    // Protection contre double exécution (important pour Fire OS)
    if (window.__FREEKIOSK_INITIALIZED__) {
      return;
    }
    window.__FREEKIOSK_INITIALIZED__ = true;

    // Debug storage availability for Pinia/Nuxt
    console.log('[FreeKiosk Debug] localStorage available:', typeof localStorage !== 'undefined');
    console.log('[FreeKiosk Debug] sessionStorage available:', typeof sessionStorage !== 'undefined');
    console.log('[FreeKiosk Debug] Cookie:', document.cookie ? 'enabled' : 'disabled');
    
    // Ensure storage is working properly
    try {
      localStorage.setItem('__test__', '1');
      localStorage.removeItem('__test__');
      console.log('[FreeKiosk Debug] localStorage: WORKING');
    } catch(e) {
      console.error('[FreeKiosk Debug] localStorage: FAILED', e);
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

    // Click handler avec navigation
    document.addEventListener('click', function(e) {
      let target = e.target;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }

     if (target && target.tagName === 'A' && target.href) {
        e.preventDefault();
        e.stopPropagation();

        // Envoi message avant navigation pour reset timer
        sendInteraction();

        window.location.href = target.href;
        return false;
      }

      // Envoi message sur tout autre clic non lien
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

  // Gestion des messages venant de la webview
  const onMessageHandler = (event: any) => {
    if (event.nativeEvent.data === 'user-interaction' && onUserInteraction) {
      console.log('[FreeKiosk] User interaction detected from WebView');
      onUserInteraction();
    }
  };

  const handleError = (event: WebViewErrorEvent): void => {
    console.log('[FreeKiosk] WebView error:', event.nativeEvent);
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
                icon="🌐" 
                text="Full HTTPS support" 
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

            {/* Hint */}
            <View style={styles.hintContainer}>
              <Text style={styles.hintText}>
                💡 Tip: Tap 5× in the bottom right corner to access settings
              </Text>
            </View>

            {/* Footer */}
            <Text style={styles.footerText}>
              Version 1.0.5 • by Rushb
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
          console.log('[FreeKiosk] Load started');
          setLoading(true);
          setError(false);
        }}
        onLoadEnd={() => {
          console.log('[FreeKiosk] Load ended');
          setLoading(false);
        }}
        onLoadProgress={({ nativeEvent }) => {
          // For SPAs like Nuxt, hide spinner when fully loaded
          if (nativeEvent.progress === 1) {
            setLoading(false);
          }
        }}
        onError={handleError}

        javaScriptEnabled={true}
        domStorageEnabled={true}
        injectedJavaScript={injectedJavaScript}

        onMessage={onMessageHandler}

        startInLoadingState={true}

        onShouldStartLoadWithRequest={(request: ShouldStartLoadRequest) => {
          console.log('[FreeKiosk] Navigation request:', request.url);

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
          console.log('[FreeKiosk] Navigation state:', navState.url, 'Loading:', navState.loading);
        }}

        scalesPageToFit={true}
        cacheEnabled={true}
        incognito={false}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        
        // Storage settings for Pinia/Nuxt compatibility
        cacheMode="LOAD_DEFAULT"
        setSupportMultipleWindows={false}

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
