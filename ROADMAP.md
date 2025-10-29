# FreeKiosk - Roadmap & Améliorations

> **Statut actuel :** v1.0.0 - MVP fonctionnel  
> **Dernière mise à jour :** 27 octobre 2025  
> **Auteur :** Valentin @ Rushb  

---

## 🎉 Version 1.0.0 - MVP (ACTUELLE) ✅

### ✅ Fonctionnalités implémentées

#### Core Kiosk
- [x] Mode Kiosk complet (Device Owner)
- [x] Screen pinning automatique au lancement
- [x] Affichage WebView fullscreen
- [x] Navigation immersive (masquage barre système)
- [x] Auto-lancement au démarrage (Boot Receiver)
- [x] Gestion liens internes WebView

#### Configuration
- [x] Configuration URL dynamique
- [x] Code PIN pour sortir du kiosk (overlay coin)
- [x] Rechargement automatique sur erreur
- [x] Persistance settings (AsyncStorage)

#### Sécurité & Réseau
- [x] Support HTTPS avec certificats auto-signés
- [x] Network Security Config
- [x] `usesCleartextTraffic` enabled
- [x] SSL errors acceptés automatiquement

#### UI/UX
- [x] Écran noir de base (pré-config)
- [x] Settings screen basique
- [x] Mode paysage/portrait adaptatif

### ⚠️ Limitations connues v1.0

- ❌ Screen pinning toujours actif (pas de toggle)
- ❌ Écran d'accueil noir peu engageant
- ❌ Settings design basique
- ❌ SSL accepté sans option (codé dur)
- ❌ Pas de logs/diagnostics
- ❌ Rechargement auto basique (pas configurable)
- ❌ Pas de gestion multi-tablettes
- ❌ Pas de remote management

### 📝 Patch manuel actuel

**Fichier modifié :**
node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java

text

**Ligne 121 :**
// AVANT : handler.cancel();
// APRÈS : handler.proceed();

text

**⚠️ À ré-appliquer après chaque `npm install`**

---

## 🚀 Version 1.1 - Polish & UX (Priorité Haute)

**Target :** Décembre 2025  
**Temps estimé :** 34h (≈ 4-5 jours)

---

### 📱 Amélioration Interface Utilisateur

#### 1. Écran d'accueil moderne (remplacer noir)
**Priorité :** ⭐⭐⭐⭐⭐  
**Temps :** 3h

**Objectif :**
Remplacer écran noir par page d'accueil moderne et engageante quand aucune URL configurée.

**Design :**
<View style={styles.welcomeScreen}> {/* Logo FreeKiosk */} <Image source={require('./assets/logo.png')} style={styles.logo} />
{/* Titre & Tagline */}
<Text style={styles.title}>Bienvenue sur FreeKiosk</Text>
<Text style={styles.subtitle}>
Solution kiosk professionnelle 100% gratuite
</Text>

{/* Features Highlights */}
<View style={styles.features}>
<FeatureCard icon="🔒" title="Sécurisé" text="Device Owner intégré" />
<FeatureCard icon="🌐" title="Flexible" text="Support HTTPS complet" />
<FeatureCard icon="⚡" title="Rapide" text="Performance optimale" />
</View>

{/* Call to Action */}
<TouchableOpacity
style={styles.setupButton}
onPress={() => navigation.navigate('Settings')}

text
<Text style={styles.setupButtonText}>⚙️ Configurer maintenant</Text>
</TouchableOpacity>
{/* Hint accès Settings */}
<Text style={styles.hint}>
💡 Astuce : Tapez 5× en bas à droite pour accéder aux paramètres
</Text>
</View>

text

**Assets requis :**
- Logo FreeKiosk (512x512 PNG + SVG)
- Icônes features
- Gradient background

**Fichiers impactés :**
- `src/screens/HomeScreen.tsx`
- `src/assets/logo.png`
- `src/assets/welcome-bg.png`

---

#### 2. Settings screen redesign (centré + moderne)
**Priorité :** ⭐⭐⭐⭐⭐  
**Temps :** 6h

**Objectif :**
Refonte complète UI Settings avec design system moderne, inputs centrés, sections organisées.

**Structure :**
<SafeAreaView style={styles.container}> <ScrollView contentContainerStyle={styles.content}>
text
{/* ===== HEADER ===== */}
<View style={styles.header}>
  <Text style={styles.headerTitle}>⚙️ Paramètres</Text>
  <Text style={styles.headerSubtitle}>Configuration du kiosk</Text>
</View>

{/* ===== SECTION URL ===== */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>🌐 URL du Kiosk</Text>
  <TextInput
    style={styles.input}
    placeholder="https://example.com"
    placeholderTextColor="#999"
    value={url}
    onChangeText={setUrl}
    autoCapitalize="none"
    autoCorrect={false}
  />
  <Text style={styles.hint}>
    L'adresse complète à afficher (HTTPS supporté)
  </Text>
</View>

{/* ===== SECTION PIN ===== */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>🔐 Code PIN</Text>
  <View style={styles.pinInputsRow}>
    {.map(index => (
      <TextInput
        key={index}
        ref={pinRefs[index]}
        style={styles.pinInput}
        maxLength={1}
        keyboardType="numeric"
        secureTextEntry
        value={pinDigits[index]}
        onChangeText={(value) => handlePinChange(index, value)}
      />
    ))}
  </View>
  <Text style={styles.hint}>
    Code de sortie du mode kiosk (4 chiffres)
  </Text>
</View>

{/* ===== SECTION MODE KIOSK ===== */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>🔒 Mode Kiosk</Text>
  
  {/* Toggle Screen Pinning */}
  <View style={styles.toggleRow}>
    <View style={styles.toggleInfo}>
      <Text style={styles.toggleLabel}>Épingler l'application</Text>
      <Text style={styles.toggleDescription}>
        Empêche l'utilisateur de quitter (Device Owner requis)
      </Text>
    </View>
    <Switch 
      value={screenPinningEnabled}
      onValueChange={handleToggleScreenPinning}
      trackColor={{ false: '#ddd', true: '#0066cc' }}
    />
  </View>
  
  {screenPinningEnabled ? (
    <View style={styles.infoBox}>
      <Text style={styles.infoText}>
        ℹ️ Code PIN requis pour quitter l'application
      </Text>
    </View>
  ) : (
    <View style={styles.warningBox}>
      <Text style={styles.warningText}>
        ⚠️ L'utilisateur pourra quitter avec le bouton retour
      </Text>
    </View>
  )}
  
  {/* Toggle Auto-Reload */}
  <View style={styles.toggleRow}>
    <View style={styles.toggleInfo}>
      <Text style={styles.toggleLabel}>Rechargement automatique</Text>
      <Text style={styles.toggleDescription}>
        Recharge la page en cas d'erreur réseau
      </Text>
    </View>
    <Switch 
      value={autoReload}
      onValueChange={setAutoReload}
      trackColor={{ false: '#ddd', true: '#0066cc' }}
    />
  </View>
</View>

{/* ===== BOUTONS ACTIONS ===== */}
<View style={styles.actions}>
  <TouchableOpacity 
    style={[styles.button, styles.buttonPrimary]}
    onPress={handleSave}
  >
    <Text style={styles.buttonText}>💾 Enregistrer</Text>
  </TouchableOpacity>
  
  <TouchableOpacity 
    style={[styles.button, styles.buttonSecondary]}
    onPress={() => navigation.goBack()}
  >
    <Text style={styles.buttonText}>❌ Annuler</Text>
  </TouchableOpacity>
</View>

{/* ===== SECTION AVANCÉ (COLLAPSIBLE) ===== */}
<TouchableOpacity 
  style={styles.advancedToggle}
  onPress={() => setShowAdvanced(!showAdvanced)}
>
  <Text style={styles.advancedToggleText}>
    ⚙️ Paramètres avancés {showAdvanced ? '▼' : '▶'}
  </Text>
</TouchableOpacity>

{showAdvanced && (
  <View style={styles.advancedSection}>
    {/* SSL Toggle */}
    {/* Logs */}
    {/* Diagnostics */}
  </View>
)}
</ScrollView> </SafeAreaView> ```
Design System :

text
const theme = {
  colors: {
    primary: '#0066cc',
    primaryLight: '#4d94ff',
    secondary: '#f0f0f0',
    text: '#333',
    textLight: '#666',
    textMuted: '#999',
    border: '#ddd',
    background: '#fff',
    backgroundDark: '#f5f5f5',
    error: '#ff3b30',
    success: '#34c759',
    warning: '#ffcc00',
    info: '#007aff',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
  typography: {
    h1: { fontSize: 28, fontWeight: 'bold' },
    h2: { fontSize: 22, fontWeight: '600' },
    h3: { fontSize: 18, fontWeight: '600' },
    body: { fontSize: 16, fontWeight: '400' },
    small: { fontSize: 14, fontWeight: '400' },
    tiny: { fontSize: 12, fontWeight: '400' },
  },
};
Fichiers impactés :

src/screens/SettingsScreen.tsx

src/theme/index.ts (nouveau)

src/components/FeatureCard.tsx (nouveau)

🔧 Fonctionnalités Mode Kiosk
3. Toggle Screen Pinning ⭐ NOUVEAU
Priorité : ⭐⭐⭐⭐⭐
Temps : 3h

Objectif :
Permettre d'activer/désactiver le screen pinning via Settings.

Implémentation :

A. KioskModule.kt - Nouvelles méthodes

text
// android/app/src/main/java/com/freekiosk/KioskModule.kt

@ReactMethod
fun setScreenPinningEnabled(enabled: Boolean, promise: Promise) {
    try {
        val prefs = reactApplicationContext
            .getSharedPreferences("kiosk_prefs", Context.MODE_PRIVATE)
        
        prefs.edit()
            .putBoolean("screen_pinning_enabled", enabled)
            .apply()
        
        val activity = currentActivity as? MainActivity
        
        if (enabled) {
            activity?.startLockTask()
            promise.resolve("Screen pinning enabled")
        } else {
            activity?.stopLockTask()
            promise.resolve("Screen pinning disabled")
        }
    } catch (e: Exception) {
        promise.reject("PINNING_ERROR", e.message)
    }
}

@ReactMethod
fun isScreenPinningEnabled(promise: Promise) {
    val prefs = reactApplicationContext
        .getSharedPreferences("kiosk_prefs", Context.MODE_PRIVATE)
    
    val enabled = prefs.getBoolean("screen_pinning_enabled", true) // Défaut: ON
    promise.resolve(enabled)
}
B. MainActivity.kt - Gestion config

text
// android/app/src/main/java/com/freekiosk/MainActivity.kt

override fun onResume() {
    super.onResume()
    applyKioskConfig()
}

private fun applyKioskConfig() {
    val prefs = getSharedPreferences("kiosk_prefs", Context.MODE_PRIVATE)
    val pinningEnabled = prefs.getBoolean("screen_pinning_enabled", true)
    
    if (pinningEnabled && !isInLockTaskMode) {
        startLockTask()
    }
}

override fun onBackPressed() {
    val prefs = getSharedPreferences("kiosk_prefs", Context.MODE_PRIVATE)
    val pinningEnabled = prefs.getBoolean("screen_pinning_enabled", true)
    
    if (!pinningEnabled) {
        super.onBackPressed() // Autoriser retour
    }
    // Si pinning ON, ne rien faire (bloquer retour)
}
C. SettingsScreen.tsx - UI Toggle

text
const [screenPinning, setScreenPinning] = useState(true);

useEffect(() => {
  KioskModule.isScreenPinningEnabled().then(setScreenPinning);
}, []);

const handleTogglePinning = async (value: boolean) => {
  try {
    setScreenPinning(value);
    await KioskModule.setScreenPinningEnabled(value);
    await AsyncStorage.setItem('screenPinningEnabled', JSON.stringify(value));
    
    Alert.alert(
      'Mode Kiosk',
      value 
        ? '🔒 Application épinglée\nCode PIN requis pour sortir'
        : '⚠️ Application non épinglée\nBouton retour autorisé',
      [{ text: 'OK' }]
    );
  } catch (error) {
    Alert.alert('Erreur', error.message);
    setScreenPinning(!value);
  }
};
Use cases :

Mode	Usage	Comportement
Pinning ON (défaut)	Production, client, autonome	Code PIN obligatoire pour sortir
Pinning OFF	Dev, tests, maintenance	Bouton retour fonctionne
Fichiers impactés :

android/app/src/main/java/com/freekiosk/KioskModule.kt

android/app/src/main/java/com/freekiosk/MainActivity.kt

src/screens/SettingsScreen.tsx

🔐 Sécurité & Configuration
4. Paramètres avancés - Toggle SSL
Priorité : ⭐⭐⭐⭐⭐
Temps : 4h

Objectif :
Rendre configurable l'acceptation des certificats SSL auto-signés (actuellement codé dur).

UI Section Avancée :

text
{showAdvanced && (
  <View style={styles.advancedSection}>
    <Text style={styles.advancedTitle}>🔐 Sécurité</Text>
    
    {/* SSL Toggle */}
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>Accepter certificats auto-signés</Text>
        <Text style={styles.toggleDescription}>
          Permet de charger des serveurs HTTPS avec certificats non vérifiés.
          Recommandé pour usage réseau local uniquement.
        </Text>
      </View>
      <Switch 
        value={acceptSelfSignedCerts}
        onValueChange={handleToggleSSL}
        trackColor={{ false: '#ddd', true: '#0066cc' }}
      />
    </View>
    
    {!acceptSelfSignedCerts && (
      <View style={styles.warningBox}>
        <Text style={styles.warningText}>
          ⚠️ Les serveurs avec certificats auto-signés ne chargeront pas
        </Text>
      </View>
    )}
    
    {acceptSelfSignedCerts && (
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          ℹ️ Certificats SSL non vérifiés acceptés automatiquement
        </Text>
      </View>
    )}
  </View>
)}
Implémentation :

A. KioskModule.kt

text
companion object {
    private var acceptSelfSignedCerts: Boolean = true // Défaut ON
    
    fun shouldAcceptSelfSignedCerts(): Boolean {
        return acceptSelfSignedCerts
    }
}

@ReactMethod
fun setAcceptSelfSignedCerts(accept: Boolean) {
    acceptSelfSignedCerts = accept
    
    val prefs = reactApplicationContext
        .getSharedPreferences("kiosk_prefs", Context.MODE_PRIVATE)
    prefs.edit()
        .putBoolean("accept_self_signed_certs", accept)
        .apply()
    
    Log.d("KioskModule", "Accept self-signed certs: $accept")
}
B. RNCWebViewClient.java (patch manuel)

text
@Override
public void onReceivedSslError(final WebView webView, final SslErrorHandler handler, final SslError error) {
    String topWindowUrl = webView.getUrl();
    String failingUrl = error.getUrl();

    // ⭐ CHECK CONFIG
    boolean shouldAccept = com.freekiosk.KioskModule.shouldAcceptSelfSignedCerts();
    
    if (shouldAccept) {
        Log.w(TAG, "SSL Error - Accepting (user config): " + failingUrl);
        handler.proceed();
    } else {
        Log.w(TAG, "SSL Error - Rejecting (user config): " + failingUrl);
        handler.cancel();
    }

    // ... reste du code
}
C. SettingsScreen.tsx

text
const [acceptSSL, setAcceptSSL] = useState(true);

useEffect(() => {
  AsyncStorage.getItem('acceptSelfSignedCerts').then(value => {
    if (value) setAcceptSSL(JSON.parse(value));
  });
}, []);

const handleToggleSSL = async (value: boolean) => {
  setAcceptSSL(value);
  await KioskModule.setAcceptSelfSignedCerts(value);
  await AsyncStorage.setItem('acceptSelfSignedCerts', JSON.stringify(value));
};
Fichiers impactés :

android/app/src/main/java/com/freekiosk/KioskModule.kt

node_modules/react-native-webview/.../RNCWebViewClient.java (patch)

src/screens/SettingsScreen.tsx

5. Auto-reload configuration
Priorité : ⭐⭐⭐⭐
Temps : 3h

Objectif :
Rendre configurable le comportement auto-reload (actuellement basique ON/OFF).

Features :

Délai entre tentatives (5s, 10s, 30s, 1min)

Nombre max tentatives (3, 5, 10, illimité)

Compteur tentatives visible

UI :

text
<View style={styles.toggleRow}>
  <View style={styles.toggleInfo}>
    <Text style={styles.toggleLabel}>Rechargement automatique</Text>
    <Text style={styles.toggleDescription}>
      Recharge la page en cas d'erreur réseau
    </Text>
  </View>
  <Switch value={autoReload} onValueChange={setAutoReload} />
</View>

{autoReload && (
  <>
    {/* Délai */}
    <View style={styles.pickerRow}>
      <Text style={styles.pickerLabel}>Délai entre tentatives</Text>
      <Picker
        selectedValue={reloadDelay}
        onValueChange={setReloadDelay}
        style={styles.picker}
      >
        <Picker.Item label="5 secondes" value={5000} />
        <Picker.Item label="10 secondes" value={10000} />
        <Picker.Item label="30 secondes" value={30000} />
        <Picker.Item label="1 minute" value={60000} />
      </Picker>
    </View>
    
    {/* Max tentatives */}
    <View style={styles.pickerRow}>
      <Text style={styles.pickerLabel}>Tentatives maximum</Text>
      <Picker
        selectedValue={maxRetries}
        onValueChange={setMaxRetries}
        style={styles.picker}
      >
        <Picker.Item label="3 tentatives" value={3} />
        <Picker.Item label="5 tentatives" value={5} />
        <Picker.Item label="10 tentatives" value={10} />
        <Picker.Item label="Illimité" value={-1} />
      </Picker>
    </View>
  </>
)}
Implémentation WebViewComponent :

text
const [retryCount, setRetryCount] = useState(0);

const handleError = (event: WebViewErrorEvent) => {
  console.log('[FreeKiosk] Error:', event.nativeEvent);
  setError(true);
  setLoading(false);
  
  if (autoReload && (maxRetries === -1 || retryCount < maxRetries)) {
    setTimeout(() => {
      setRetryCount(retryCount + 1);
      webViewRef.current?.reload();
      setError(false);
    }, reloadDelay);
  }
};
Fichiers impactés :

src/components/WebViewComponent.tsx

src/screens/SettingsScreen.tsx

🔍 Diagnostics & Debug
6. Logs & Diagnostics
Priorité : ⭐⭐⭐⭐
Temps : 4h

Objectif :
Ajouter écran Logs pour debug et diagnostics.

Features :

Historique événements app

Logs erreurs WebView

Logs SSL

Export logs .txt

Accessible via Settings

UI Logs Screen :

text
<SafeAreaView style={styles.container}>
  <View style={styles.header}>
    <Text style={styles.title}>📋 Logs</Text>
    <TouchableOpacity onPress={handleExportLogs}>
      <Text style={styles.exportButton}>💾 Exporter</Text>
    </TouchableOpacity>
  </View>
  
  <FlatList
    data={logs}
    renderItem={({ item }) => (
      <View style={styles.logItem}>
        <Text style={styles.logTime}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
        <Text style={[styles.logMessage, getLogStyle(item.type)]}>
          {item.message}
        </Text>
      </View>
    )}
  />
  
  <TouchableOpacity 
    style={styles.clearButton}
    onPress={handleClearLogs}
  >
    <Text style={styles.clearButtonText}>🗑️ Effacer les logs</Text>
  </TouchableOpacity>
</SafeAreaView>
Types de logs capturés :

text
interface Log {
  timestamp: number;
  type: 'info' | 'warning' | 'error' | 'success';
  category: 'app' | 'webview' | 'network' | 'ssl' | 'kiosk';
  message: string;
}

// Exemples
logs = [
  { timestamp: Date.now(), type: 'info', category: 'app', message: 'Application démarrée' },
  { timestamp: Date.now(), type: 'success', category: 'webview', message: 'Page chargée: https://...' },
  { timestamp: Date.now(), type: 'warning', category: 'ssl', message: 'Certificat auto-signé accepté' },
  { timestamp: Date.now(), type: 'error', category: 'network', message: 'Timeout connexion' },
];
Fichiers impactés :

src/screens/LogsScreen.tsx (nouveau)

src/utils/Logger.ts (nouveau)

src/components/WebViewComponent.tsx (ajouter logs)

7. Loading states améliorés
Priorité : ⭐⭐⭐
Temps : 2h

Objectif :
Améliorer feedback visuel pendant chargement page.

Features :

Progress bar pendant chargement

Message état actuel

Animation loading moderne

Timeout configurable

UI :

text
{loading && !error && (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#0066cc" />
    <Text style={styles.loadingText}>Connexion au serveur...</Text>
    
    {/* Progress Bar */}
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBar, { width: `${progress}%` }]} />
    </View>
    
    <Text style={styles.loadingSubtext}>{url}</Text>
    
    {retryCount > 0 && (
      <Text style={styles.retryText}>
        Tentative {retryCount + 1}/{maxRetries}
      </Text>
    )}
  </View>
)}
Fichiers impactés :

src/components/WebViewComponent.tsx

📦 Préparation Release
8. Screenshots tablette Play Store
Priorité : ⭐⭐⭐⭐⭐
Temps : 3h

Objectif :
Prendre screenshots professionnels sur vraie tablette pour Play Store.

Screens requis (min 4, max 8) :

Écran accueil moderne

Logo FreeKiosk

Features highlights

Bouton "Configurer"

Settings screen

URL configurée

Toggles visibles

Design moderne

WebView en action

Dashboard exemple (Home Assistant, Grafana, ou custom)

Fullscreen

Beau design

Device Owner setup

Étapes activation

QR Code ou commande ADB

Paramètres avancés (optionnel)

Section SSL

Logs

Toggles

Dimensions requises :

Phone: 1080x1920 (16:9) - Min 2 screenshots

Tablet 7": 1200x1920 - Min 1 screenshot

Tablet 10": 2560x1600 - Min 1 screenshot

Editing :

Ajouter annotations

Highlights features clés

Flèches pointeurs

Texte court explicatif

Outils :

Android Studio Emulator (haute résolution)

Figma pour annotations

Canva pour layout final

9. Description Play Store optimisée
Priorité : ⭐⭐⭐⭐⭐
Temps : 2h

Titre (max 50 caractères) :

text
FreeKiosk - Mode Kiosk Gratuit & Pro
Description courte (max 80 caractères) :

text
Kiosk professionnel 100% gratuit: Device Owner, HTTPS, interface moderne
Description longue :

text
# 🎯 FreeKiosk - La Solution Kiosk Professionnelle Gratuite

## Pourquoi FreeKiosk ?

✅ **100% Gratuit** - Aucun abonnement, aucune limite  
✅ **Device Owner Intégré** - Configuration simplifiée  
✅ **Support HTTPS Complet** - Certificats auto-signés acceptés  
✅ **Interface Moderne** - Design épuré et intuitif  
✅ **Open Source** - Code transparent sur GitHub  

## 🚀 Fonctionnalités

### Mode Kiosk Complet
- Verrouillage total de la tablette
- Navigation bloquée (configurable)
- Boutons système masqués
- Code PIN de sortie sécurisé
- Auto-lancement au démarrage

### Configuration Simplifiée
- Interface moderne et intuitive
- Paramètres avancés pour experts
- Import/Export configuration
- Logs et diagnostics intégrés

### Performance Optimale
- WebView optimisée
- Rechargement automatique configurable
- Faible consommation batterie
- Support offline

## 📱 Cas d'usage

- **📊 Dashboards** - Home Assistant, Grafana, Kibana
- **🏠 Domotique** - Contrôle maison connectée
- **🏢 Signalétique** - Affichage dynamique entreprise
- **🎨 Portfolio** - Présentation interactive
- **📈 Monitoring** - Supervision temps réel

## 🔒 Sécurité & Certificats SSL

FreeKiosk accepte par défaut les certificats SSL auto-signés,  
optimisé pour l'affichage de serveurs locaux.

Cette option est **configurable** dans les paramètres avancés  
pour un usage plus restrictif si besoin.

⚠️ **Recommandation :** Usage réseau local privé uniquement.

## ⚙️ Configuration Requise

- Android 9.0+ (API 28+)
- Device Owner recommandé (pas obligatoire)
- 50 MB espace disque

## 📞 Support

- **GitHub :** github.com/rushb-fr/freekiosk  
- **Documentation :** rushb.fr/freekiosk  
- **Email :** support@rushb.fr

## 🌟 Open Source

Licence MIT - Contributions bienvenues !

---

**Développé avec ❤️ par Rushb**
Mots-clés (max 5) :

text
kiosk, tablette, dashboard, device owner, gratuit
10. Vidéo promo (optionnel)
Priorité : ⭐⭐⭐
Temps : 4h

Format :

Durée: 30-60 secondes

Résolution: 1920x1080 minimum

Format: MP4

Taille max: 100 MB

Structure :

Intro (5s)

Logo FreeKiosk animation

Tagline "Solution Kiosk Gratuite"

Demo Features (30s)

Setup Device Owner (3s)

Config URL simple (5s)

Dashboard affichage (5s)

Navigation bloquée (3s)

Code PIN sortie (4s)

Settings moderne (5s)

Toggle pinning (5s)

Use cases (10s)

3 exemples split screen :

Home automation

Corporate dashboard

Digital signage

Outro (5s)

"100% Gratuit & Open Source"

"Téléchargez maintenant"

Logo + QR Code Play Store

Outils :

OBS Studio (recording)

DaVinci Resolve (editing)

Musique: Epidemic Sound ou YouTube Audio Library

📊 Résumé Version 1.1
Temps total estimé
34 heures (4-5 jours développement)

Répartition
Catégorie	Heures	%
Design/UX	12h	35%
Features techniques	14h	41%
Assets/Marketing	8h	24%
Priorités
⭐⭐⭐⭐⭐ Écran accueil moderne

⭐⭐⭐⭐⭐ Settings redesign

⭐⭐⭐⭐⭐ Toggle Screen Pinning

⭐⭐⭐⭐⭐ Toggle SSL configurable

⭐⭐⭐⭐ Logs & diagnostics

Planning suggéré
Semaine 1 (2 jours)

 Écran accueil moderne (3h)

 Settings redesign (6h)

 Toggle Screen Pinning (3h)

Semaine 2 (2 jours)

 Paramètres avancés SSL (4h)

 Auto-reload config (3h)

 Loading states (2h)

 Logs & diagnostics (4h)

Semaine 3 (1 jour)

 Screenshots tablette (3h)

 Description Play Store (2h)

 Tests complets (3h)

Optionnel :

 Vidéo promo (4h)

🚧 Version 1.2 - Features Avancées
Target : T1 2026
Temps estimé : 38h

Features planifiées
Sécurité
Certificate pinning

Multi-profils kiosk

Protection PIN renforcée (tentatives limitées)

Whitelist hostnames

UX/UI
Modal PIN centrée + animations

QR Code configuration

Thèmes personnalisables (dark/light)

Orientation lock configurable

Splash screen custom

Fonctionnalités
Mode offline (cache pages)

Custom headers HTTP

WebSocket support amélioré

Mode maintenance

Export/Import
Backup configuration JSON

Import config via QR Code

Sync multi-tablettes

🌟 Version 2.0 - Cloud & Remote Management
Target : T2/T3 2026
Temps estimé : 72h

Features cloud
Remote Configuration
Backend API Firebase/Supabase

Update config à distance

Push notifications

Fleet management (multi-tablettes)

Analytics & Monitoring
Uptime tracking

Error reporting

Usage statistics

Dashboard admin web

OTA Updates
Update app à distance

Rollback automatique

Staged rollout

A/B testing

Multi-Tenancy
Support multi-clients

Isolation config

Billing intégré

White-label option

🎯 Features Backlog (Nice to Have)
Gestes & Interactions
Swipe to refresh

Pinch to zoom (désactivable)

Long press actions

Double tap pour refresh

Mode Presentation
Rotation auto slides

Timeout inactivité

Screensaver

Slideshow multi-URLs

Media
Picture-in-picture

Fullscreen video

Audio autoplay control

Media controls custom

Intégrations
MQTT broker support

REST API locale

Webhook events

IFTTT/Zapier

Accessibilité
Support lecteur écran

Contraste amélioré

Taille police configurable

Voice control

Developer Tools
Remote debugging

Console JavaScript

Network inspector

Performance profiler

📝 Technical Debt
Code Quality
 Tests unitaires (Jest) - 15h

 Tests E2E (Detox) - 20h

 CI/CD pipeline (GitHub Actions) - 8h

 ESLint strict mode - 3h

 TypeScript strict mode - 5h

 Documentation JSDoc - 10h

Performance
 Optimiser WebView memory - 4h

 Lazy loading components - 3h

 Image caching strategy - 4h

 Bundle size optimization - 3h

Sécurité
 Security audit complet - 12h

 ProGuard configuration - 3h

 Code obfuscation - 4h

 Penetration testing - 8h

🐛 Bugs Connus
Haute Priorité
Aucun actuellement 🎉

Basse Priorité
WebView RAM élevée après longue durée (>24h)

Rotation écran peut recharger page

Logs limités à 100 entrées (by design)

📚 Documentation à Créer
User Documentation
 Guide installation détaillé

 Tutoriel Device Owner activation

 FAQ utilisateur

 Troubleshooting guide

 Video tutorials YouTube

Developer Documentation
 Architecture overview

 Setup dev environment

 Build & release guide

 Contributing guidelines

 API documentation

Admin Documentation
 Deployment best practices

 Security guidelines

 Network configuration

 Remote management guide

 Monitoring & logs analysis

🎯 Critères de Succès
Version 1.1
✅ SSL configurable

✅ Screen pinning configurable

✅ Écran accueil moderne

✅ Settings UX améliorée

📊 Crash rate < 0.1%

📊 95% users gardent SSL activé

📊 Play Store rating > 4.5

Version 1.2
📊 Certificate pinning utilisé par 20% users

📊 QR config utilisé par 40% deployments

📊 Multi-profils utilisé par 15% users

📊 Offline mode actif 30% du temps

Version 2.0
📊 Remote config adopté par 60% users

📊 Fleet management > 1000 tablettes

📊 OTA success rate > 99%

📊 Analytics coverage 95%

📞 Feedback & Contributions
Proposer une amélioration
Créer issue GitHub

Template "Feature Request"

Expliquer use case détaillé

Proposer solution si possible

Contribuer au code
Fork repository

Créer branche feature

Développer + tests

Pull request avec description

Signaler un bug
Issue GitHub "Bug Report"

Steps to reproduce

Screenshots/logs

Version app + Android

🏁 Conclusion
Vision FreeKiosk :

v1.0 : MVP fonctionnel ✅

v1.1 : Polish & UX professionnelle 🎨

v1.2 : Features avancées power users 🔧

v2.0 : Cloud & scalabilité entreprise ☁️

Philosophie :

Gratuit forever

Open source

User-first design

Développement itératif

Community-driven

Dernière modification : 27 octobre 2025
Version : 1.0.0
Auteur : Valentin @ Rushb
License : MIT
GitHub : github.com/rushb-fr/freekiosk
Website : rushb.fr/freekiosk

Made with ❤️ in France 🇫🇷


**Voilà ! ROADMAP.md COMPLET avec toutes les corrections ! 🎉**

**Points clés :**
- ✅ Toggle Screen Pinning ajouté (priorité haute)
- ❌ Modal PIN centrée retirée de v1.1
- ❌ QR Code reporté à v1.2
- ✅ Écran accueil moderne inclus
- ✅ Settings redesign détaillé
- ✅ SSL toggle configurable
- ✅ Planning réaliste 34h