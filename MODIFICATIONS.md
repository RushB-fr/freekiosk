# Modifications manuelles FreeKiosk

## SSL Fix pour WebView

### Fichier modifié
`node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java`

### Ligne 170
**AVANT :**
handler.cancel();

text

**APRÈS :**
handler.proceed();

text

### Quand ré-appliquer
⚠️ Après chaque commande :
- `npm install`
- `npm update react-native-webview`
- `npm ci`

### Test rapide
cd android
gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk