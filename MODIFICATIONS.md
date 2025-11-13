# Modifications manuelles FreeKiosk

## SSL Fix pour WebView

### Fichier modifié
`node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java`

### Coller ceci (fichier complet) : 
package com.reactnativecommunity.webview;

import androidx.annotation.Nullable;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class RNCWebViewPackage extends TurboReactPackage {

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        List<ViewManager> viewManagers = new ArrayList<>();
        viewManagers.add(new RNCWebViewManager());
        return viewManagers;
    }

    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            final Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
            boolean isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
            moduleInfos.put(
                    RNCWebViewModuleImpl.NAME,
                    new ReactModuleInfo(
                            RNCWebViewModuleImpl.NAME,
                            RNCWebViewModuleImpl.NAME,
                            false, // canOverrideExistingModule
                            false, // needsEagerInit
                            true, // hasConstants
                            false, // isCxxModule
                            isTurboModule // isTurboModule
                    ));
            return moduleInfos;
        };
    }

    @Nullable
    @Override
    public NativeModule getModule(String name, ReactApplicationContext reactContext) {
        if (name.equals(RNCWebViewModuleImpl.NAME)) {
            return new RNCWebViewModule(reactContext);
        } else {
            return null;
        }
    }

}


### Quand ré-appliquer
⚠️ Après chaque commande :
- `npm install`
- `npm update react-native-webview`
- `npm ci`

### Test rapide
cd android
gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk


