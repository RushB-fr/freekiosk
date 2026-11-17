import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, useWindowDimensions, Dimensions } from 'react-native';
import StatusBar from './StatusBar';
import AppLauncherModule from '../utils/AppLauncherModule';
import { ManagedApp, getManagedAppKey } from '../types/managedApps';
import { AppGroup } from '../types/appGroups';
import { getAppsInGroup, getChildGroups, getGroupPath, normalizeAppGroups } from '../utils/appGroupLayout';
import { DEFAULT_WALLPAPER_POSITION, WallpaperPosition } from '../types/wallpaper';
import { getAdminAccessPositionStyle } from '../types/adminAccessPosition';

const DEFAULT_WALLPAPER = require('../assets/images/wallpaper.png');

interface ExternalAppOverlayProps {
  /** Legacy single-app package (backward compat) */
  externalAppPackage: string | null;
  /** Managed apps list for multi-app home screen */
  managedApps?: ManagedApp[];
  /** Row and nested-folder definitions for the multi-app home screen. */
  appGroups?: AppGroup[];
  /** External app sub-mode: single (classic) or multi (grid) */
  externalAppMode?: 'single' | 'multi';
  /** Background color for the external-app kiosk screens */
  backgroundColor?: string;
  /** Whether a wallpaper is rendered above the fallback background color */
  backgroundImageEnabled?: boolean;
  /** Custom HTTP(S)/file URI. Empty uses the bundled wallpaper.png. */
  backgroundImage?: string;
  /** Anchor used when the cover-scaled image is cropped */
  backgroundImagePosition?: WallpaperPosition;
  isAppLaunched: boolean;
  backButtonMode: string;
  /** Number of taps to return to settings (default 5) */
  returnTapCount?: number;
  /** Return mode: 'tap_anywhere' or 'button' (same as webview) */
  returnMode?: string;
  /** Detection timeout in ms for all taps (same as webview) */
  returnTapTimeout?: number;
  /** Whether the return button is visible (button mode only) */
  returnButtonVisible?: boolean;
  /** Fixed dashboard/PIN access position using the shared nine-point screen grid. */
  returnButtonPosition?: string;
  showStatusBar?: boolean;
  showBattery?: boolean;
  showWifi?: boolean;
  showBluetooth?: boolean;
  showVolume?: boolean;
  showTime?: boolean;
  statusBarTheme?: 'dark' | 'light';
  onReturnToApp: () => void;
  onGoToSettings: () => void;
  /** Called when user taps an app in the multi-app grid */
  onLaunchApp?: (packageName: string, microAppId?: string) => void;
}

const ExternalAppOverlay: React.FC<ExternalAppOverlayProps> = ({
  externalAppPackage,
  managedApps = [],
  appGroups = [],
  externalAppMode = 'single',
  backgroundColor = '#333',
  backgroundImageEnabled = true,
  backgroundImage = '',
  backgroundImagePosition = DEFAULT_WALLPAPER_POSITION,
  isAppLaunched,
  backButtonMode,
  returnTapCount = 5,
  returnMode = 'tap_anywhere',
  returnTapTimeout = 1500,
  returnButtonVisible = false,
  returnButtonPosition = 'bottom-right',
  showStatusBar = false,
  showBattery = true,
  showWifi = true,
  showBluetooth = true,
  showVolume = true,
  showTime = true,
  statusBarTheme = 'dark',
  onReturnToApp,
  onGoToSettings,
  onLaunchApp,
}) => {
  // Window dimensions must be reactive — `Dimensions.get('window')` is evaluated once
  // at module load, so tile widths captured in landscape stay wrong after rotation to portrait.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Android's window metrics can continue excluding a hidden navigation inset even when the
  // activity surface is edge-to-edge. Use the physical screen extent for the wallpaper so the
  // hidden bottom bar cannot leave a bar-shaped strip of fallback background behind it.
  const screenDimensions = Dimensions.get('screen');
  const wallpaperViewportWidth = Math.max(windowWidth, screenDimensions.width);
  const wallpaperViewportHeight = Math.max(windowHeight, screenDimensions.height);
  const APP_GRID_MAX_COLUMNS = 6;
  const APP_GRID_MIN_TILE_WIDTH = 88;
  const APP_GRID_MAX_TILE_WIDTH = 128;
  const APP_GRID_HORIZONTAL_PADDING = 16;
  const APP_GRID_GAP = 12;
  const maxColumnsForWidth = Math.max(
    1,
    Math.min(
      APP_GRID_MAX_COLUMNS,
      Math.floor(
        (windowWidth - APP_GRID_HORIZONTAL_PADDING * 2 + APP_GRID_GAP) /
        (APP_GRID_MIN_TILE_WIDTH + APP_GRID_GAP),
      ),
    ),
  );

  const [appLabels, setAppLabels] = useState<Record<string, string>>({});
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const defaultWallpaperSize = Image.resolveAssetSource(DEFAULT_WALLPAPER);
  const [wallpaperSize, setWallpaperSize] = useState({
    width: defaultWallpaperSize.width,
    height: defaultWallpaperSize.height,
  });
  const [wallpaperFailed, setWallpaperFailed] = useState(false);

  useEffect(() => {
    setWallpaperFailed(false);
    if (!backgroundImage) {
      setWallpaperSize({ width: defaultWallpaperSize.width, height: defaultWallpaperSize.height });
      return;
    }
    Image.getSize(
      backgroundImage,
      (width, height) => setWallpaperSize({ width, height }),
      () => setWallpaperFailed(true),
    );
  }, [backgroundImage, defaultWallpaperSize.height, defaultWallpaperSize.width]);

  const wallpaperLayout = useMemo(() => {
    if (wallpaperSize.width <= 0 || wallpaperSize.height <= 0) return null;
    const scale = Math.max(
      wallpaperViewportWidth / wallpaperSize.width,
      wallpaperViewportHeight / wallpaperSize.height,
    );
    const width = wallpaperSize.width * scale;
    const height = wallpaperSize.height * scale;
    const [vertical, horizontal] = backgroundImagePosition.split('-');
    const horizontalRatio = horizontal === 'left' ? 0 : horizontal === 'right' ? 1 : 0.5;
    const verticalRatio = vertical === 'top' ? 0 : vertical === 'bottom' ? 1 : 0.5;
    return {
      width,
      height,
      left: (wallpaperViewportWidth - width) * horizontalRatio,
      top: (wallpaperViewportHeight - height) * verticalRatio,
    };
  }, [
    backgroundImagePosition,
    wallpaperSize,
    wallpaperViewportHeight,
    wallpaperViewportWidth,
  ]);

  const renderWallpaper = () => {
    if (!backgroundImageEnabled || wallpaperFailed || !wallpaperLayout) return null;
    return (
      <Image
        source={backgroundImage ? { uri: backgroundImage } : DEFAULT_WALLPAPER}
        style={[styles.wallpaper, wallpaperLayout]}
        resizeMode="stretch"
        accessible={false}
        onError={() => setWallpaperFailed(true)}
      />
    );
  };
  
  // Return to settings — same mechanism as WebView (tap_anywhere / button)
  const gridTapCountRef = useRef<number>(0);
  const gridTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstTapXRef = useRef<number>(0);
  const firstTapYRef = useRef<number>(0);
  const TAP_PROXIMITY_RADIUS = 80;

  // tap_anywhere mode: N-tap with spatial proximity check (identical to WebView)
  const handleGridTouch = useCallback((event: any) => {
    if (returnMode !== 'tap_anywhere') return;

    const tapX = event.nativeEvent.pageX ?? 0;
    const tapY = event.nativeEvent.pageY ?? 0;

    if (gridTapCountRef.current === 0) {
      firstTapXRef.current = tapX;
      firstTapYRef.current = tapY;
      gridTapCountRef.current = 1;
    } else {
      const dx = tapX - firstTapXRef.current;
      const dy = tapY - firstTapYRef.current;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= TAP_PROXIMITY_RADIUS) {
        gridTapCountRef.current += 1;
      } else {
        // Too far — reset and start new sequence from this tap
        firstTapXRef.current = tapX;
        firstTapYRef.current = tapY;
        gridTapCountRef.current = 1;
      }
    }

    if (gridTapCountRef.current >= returnTapCount) {
      gridTapCountRef.current = 0;
      if (gridTapTimerRef.current) clearTimeout(gridTapTimerRef.current);
      onGoToSettings();
      return;
    }

    if (gridTapTimerRef.current) clearTimeout(gridTapTimerRef.current);
    gridTapTimerRef.current = setTimeout(() => {
      gridTapCountRef.current = 0;
    }, returnTapTimeout);
  }, [returnMode, returnTapCount, returnTapTimeout, onGoToSettings]);

  // button mode: N-tap on fixed corner button (identical to WebView)
  const handleGridButtonTap = useCallback(() => {
    gridTapCountRef.current++;

    if (gridTapCountRef.current >= returnTapCount) {
      gridTapCountRef.current = 0;
      if (gridTapTimerRef.current) clearTimeout(gridTapTimerRef.current);
      onGoToSettings();
      return;
    }

    if (gridTapTimerRef.current) clearTimeout(gridTapTimerRef.current);
    gridTapTimerRef.current = setTimeout(() => {
      gridTapCountRef.current = 0;
    }, returnTapTimeout);
  }, [returnTapCount, returnTapTimeout, onGoToSettings]);

  const buttonPositionStyle = useMemo(
    () => getAdminAccessPositionStyle(returnButtonPosition),
    [returnButtonPosition],
  );
  
  // Only show the organized app home when explicitly in multi mode. Invalid/deleted group
  // references fail safely into the root Apps row so an allowed app can never disappear.
  const normalizedGroups = useMemo(() => normalizeAppGroups(appGroups), [appGroups]);
  const validGroupIds = useMemo(
    () => new Set(normalizedGroups.map(group => group.id)),
    [normalizedGroups],
  );
  const homeScreenApps = useMemo(() => externalAppMode === 'multi'
    ? managedApps
      .filter(app => app.showOnHomeScreen)
      .map(app => app.groupId && !validGroupIds.has(app.groupId) ? { ...app, groupId: null } : app)
    : [],
  [externalAppMode, managedApps, validGroupIds]);
  const isMultiAppMode = externalAppMode === 'multi' && homeScreenApps.length > 0;
  const appGridNumColumns = Math.max(1, maxColumnsForWidth);
  const appGridAvailableWidth =
    windowWidth -
    APP_GRID_HORIZONTAL_PADDING * 2 -
    APP_GRID_GAP * (appGridNumColumns - 1);
  const appTileWidth = Math.min(
    APP_GRID_MAX_TILE_WIDTH,
    Math.max(APP_GRID_MIN_TILE_WIDTH, appGridAvailableWidth / appGridNumColumns),
  );

  const homeScreenAppPackagesKey = homeScreenApps
    .map(getManagedAppKey)
    .sort()
    .join('|');

  useEffect(() => {
    if (activeGroupId && !validGroupIds.has(activeGroupId)) {
      setActiveGroupId(null);
    }
  }, [activeGroupId, validGroupIds]);
  
  // Resolve app labels and icons for display
  useEffect(() => {
    const resolveLabelsAndIcons = async () => {
      const labels: Record<string, string> = {};
      const icons: Record<string, string> = {};
      const appsToResolve: Array<Pick<ManagedApp, 'packageName' | 'displayName' | 'microAppId'>> =
        isMultiAppMode ? homeScreenApps :
        (externalAppPackage ? [{ packageName: externalAppPackage, displayName: '' }] : []);
      // Live micro-app names so a rename in MicroAppStation shows without re-adding.
      const microAppNames = new Map<string, string>();
      if (appsToResolve.some(app => app.microAppId)) {
        try {
          (await AppLauncherModule.getMicroApps()).forEach(app => {
            if (app.name) microAppNames.set(getManagedAppKey(app), app.name);
          });
        } catch {
          // Host unavailable — keep the saved display names
        }
      }

      await Promise.all(appsToResolve.map(async (app) => {
        const key = getManagedAppKey(app);
        if (app.microAppId) {
          labels[key] = microAppNames.get(key) || app.displayName || 'Micro-app';
          try {
            icons[key] = await AppLauncherModule.getMicroAppIcon(app.packageName, app.microAppId, 128);
          } catch {
            // No icon available — fallback to initials
          }
          return;
        }
        try {
          const label = await AppLauncherModule.getPackageLabel(app.packageName);
          labels[key] = label;
        } catch {
          labels[key] = app.displayName || app.packageName;
        }
        try {
          const icon = await AppLauncherModule.getAppIcon(app.packageName, 128);
          icons[key] = icon;
        } catch {
          // No icon available — fallback to initials
        }
      }));
      setAppLabels(labels);
      setAppIcons(icons);
    };
    resolveLabelsAndIcons();
  }, [homeScreenAppPackagesKey, externalAppPackage, homeScreenApps, isMultiAppMode]);

  const handleAppPress = (item: ManagedApp) => {
    if (onLaunchApp) {
      onLaunchApp(item.packageName, item.microAppId);
    }
  };

  const renderAppIcon = (item: ManagedApp) => {
    const key = getManagedAppKey(item);
    const label = appLabels[key] || item.displayName || item.packageName.split('.').pop() || '?';
    const initials = label.substring(0, 2).toUpperCase();
    const iconUri = appIcons[key];
    
    return (
      <TouchableOpacity
        key={key}
        style={[styles.appIconContainer, { width: appTileWidth }]}
        onPress={() => handleAppPress(item)}
        activeOpacity={0.7}
      >
        {iconUri ? (
          <Image
            source={{ uri: iconUri }}
            style={styles.appIconImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.appIconCircle}>
            <Text style={styles.appIconText}>{initials}</Text>
          </View>
        )}
        <Text style={styles.appIconLabel} numberOfLines={2}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderNestedGroup = (group: AppGroup, depth: number) => (
    <TouchableOpacity
      key={group.id}
      style={[styles.nestedGroupCard, { marginLeft: Math.min(depth, 3) * 12 }]}
      activeOpacity={0.75}
      onPress={() => setActiveGroupId(group.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${group.name} group`}
    >
      <View style={styles.nestedFolderIcon}>
        <Text style={styles.nestedFolderGlyph}>▦</Text>
      </View>
      <View style={styles.nestedGroupInfo}>
        <Text style={styles.nestedGroupName}>{group.name}</Text>
        <Text style={styles.nestedGroupCount}>
          {getAppsInGroup(homeScreenApps, group.id).length} apps
          {getChildGroups(normalizedGroups, group.id).length > 0
            ? ` · ${getChildGroups(normalizedGroups, group.id).length} groups`
            : ''}
        </Text>
      </View>
      <Text style={styles.nestedChevron}>›</Text>
    </TouchableOpacity>
  );

  const renderGroupNode = (group: AppGroup, depth = 0): React.ReactNode => {
    if (group.displayMode === 'nested') return renderNestedGroup(group, depth);
    const apps = getAppsInGroup(homeScreenApps, group.id);
    const children = getChildGroups(normalizedGroups, group.id);
    return (
      <View key={group.id} style={[styles.appGroupSection, depth > 0 && styles.childGroupSection]}>
        {apps.length > 0 && (
          <View style={styles.appTileWrap}>{apps.map(renderAppIcon)}</View>
        )}
        {apps.length === 0 && children.length === 0 && (
          <Text style={styles.emptyGroupText}>No apps in this group</Text>
        )}
        {children.map(child => renderGroupNode(child, depth + 1))}
      </View>
    );
  };

  const activeGroup = activeGroupId
    ? normalizedGroups.find(group => group.id === activeGroupId) ?? null
    : null;
  const currentParentId = activeGroup?.id ?? null;
  const currentApps = getAppsInGroup(homeScreenApps, currentParentId);
  const currentGroups = getChildGroups(normalizedGroups, currentParentId);

  const renderOrganizedContent = () => (
    <>
      {currentApps.length > 0 && (
        <View style={styles.appGroupSection}>
          <View style={styles.appTileWrap}>{currentApps.map(renderAppIcon)}</View>
        </View>
      )}
      {currentGroups.map(group => renderGroupNode(group))}
      {currentApps.length === 0 && currentGroups.length === 0 && (
        <Text style={styles.emptyGroupText}>No apps in this group</Text>
      )}
    </>
  );

  // Keep the kiosk home rendered behind the external task. Android places the
  // selected app above this activity; if a vendor build refuses the launch, the
  // user sees the app grid instead of a blank background.
  if (isMultiAppMode) {
    return (
      <View style={[styles.container, { backgroundColor }]} onTouchStart={handleGridTouch}>
        {renderWallpaper()}
        {showStatusBar && (
          <StatusBar
            showBattery={showBattery}
            showWifi={showWifi}
            showBluetooth={showBluetooth}
            showVolume={showVolume}
            showTime={showTime}
            theme={statusBarTheme}
          />
        )}
        <View style={styles.multiAppHeader}>
          <Image
            source={require('../assets/images/logo_circle.png')}
            style={styles.miniLogo}
            resizeMode="contain"
          />
          <Text style={styles.multiAppTitle}>FreeKiosk</Text>
        </View>
        {activeGroup && (
          <View style={styles.nestedHeader}>
            <TouchableOpacity
              style={styles.nestedBackButton}
              onPress={() => setActiveGroupId(activeGroup.parentGroupId)}
              accessibilityRole="button"
              accessibilityLabel="Back to parent group"
            >
              <Text style={styles.nestedBackGlyph}>‹</Text>
            </TouchableOpacity>
            <View style={styles.nestedHeaderText}>
              <Text style={styles.nestedEyebrow}>APP GROUP</Text>
              <Text style={styles.nestedTitle} numberOfLines={1}>{getGroupPath(normalizedGroups, activeGroup.id)}</Text>
            </View>
          </View>
        )}
        <ScrollView
          style={styles.appGridList}
          contentContainerStyle={styles.appGrid}
          showsVerticalScrollIndicator={false}
        >
          {renderOrganizedContent()}
        </ScrollView>
        
        {/* Test mode warning */}
        {backButtonMode === 'test' && (
          <View style={styles.testModeBar}>
            <Text style={styles.testModeText}>🧪 Test Mode — Back button returns to settings</Text>
          </View>
        )}

        {/* Fixed button mode: floating return button (same as WebView) */}
        {returnMode === 'button' && (
          <TouchableOpacity
            style={[
              styles.floatingReturnButton,
              buttonPositionStyle,
              {
                opacity: returnButtonVisible ? 1 : 0,
                backgroundColor: returnButtonVisible ? '#2196F3' : 'transparent',
              },
            ]}
            activeOpacity={1}
            onPress={handleGridButtonTap}
          >
            <Text style={[styles.floatingReturnButtonText, { opacity: returnButtonVisible ? 1 : 0 }]}>↩</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Single-app mode or app is running: show original overlay
  return (
    <View style={[styles.container, { backgroundColor }]}>
      {renderWallpaper()}
      {showStatusBar && (
        <StatusBar
          showBattery={showBattery}
          showWifi={showWifi}
          showBluetooth={showBluetooth}
          showVolume={showVolume}
          showTime={showTime}
          theme={statusBarTheme}
        />
      )}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Logo/Icon Area */}
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
          <Text style={styles.title}>FreeKiosk</Text>
          <Text style={styles.subtitle}>External App Mode</Text>

          {/* Status Message */}
          <View style={styles.statusContainer}>
            <View style={styles.statusCard}>
              <Text style={styles.statusIcon}>
                {isAppLaunched ? '📱' : '⏳'}
              </Text>
              <Text style={styles.statusText}>
                {isAppLaunched
                  ? 'External application is running'
                  : 'Waiting for application...'}
              </Text>
              {externalAppPackage && (
                <Text style={styles.packageName}>{appLabels[externalAppPackage] || externalAppPackage}</Text>
              )}
            </View>
          </View>

          {/* Mode Info - Only show in test mode */}
          {backButtonMode === 'test' && (
            <View style={styles.warningContainer}>
              <View style={styles.warningCard}>
                <Text style={styles.warningIcon}>🧪</Text>
                <Text style={styles.warningTitle}>Test Mode Active</Text>
                <Text style={styles.warningText}>
                  You can use the Android back button to return to FreeKiosk.
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onReturnToApp}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                ↩ Return to Application
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onGoToSettings}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>⚙ Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Hint */}
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>
              💡 Tip: While in the external app, tap 5× on the secret button to return here (position configurable)
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#333',
    overflow: 'hidden',
  },
  wallpaper: {
    position: 'absolute',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  content: {
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
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 40,
    textAlign: 'center',
  },
  statusContainer: {
    width: '100%',
    marginBottom: 32,
  },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '500',
  },
  packageName: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 4,
  },
  warningContainer: {
    width: '100%',
    marginBottom: 24,
  },
  warningCard: {
    backgroundColor: '#FFA726',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
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
  },
  primaryButtonText: {
    color: '#0066cc',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  hintContainer: {
    marginTop: 24,
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
  // Multi-app home screen styles
  multiAppHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: -1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    opacity: 0,
  },
  miniLogo: {
    width: 32,
    height: 32,
    opacity: 0,
  },
  multiAppTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  appGridList: {
    flex: 1,
  },
  appGrid: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 16,
  },
  appGroupSection: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  childGroupSection: {
    marginTop: 12,
  },
  appTileWrap: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    columnGap: 12,
    rowGap: 8,
  },
  nestedGroupCard: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 22, 31, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 4,
  },
  nestedFolderIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 108, 34, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 108, 34, 0.55)',
    marginRight: 12,
  },
  nestedFolderGlyph: {
    color: '#FF9A59',
    fontSize: 23,
    fontWeight: '700',
  },
  nestedGroupInfo: {
    flex: 1,
  },
  nestedGroupName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  nestedGroupCount: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    marginTop: 2,
  },
  nestedChevron: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 30,
    lineHeight: 32,
    marginLeft: 10,
  },
  nestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: 'rgba(4, 12, 18, 0.62)',
  },
  nestedBackButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    marginRight: 12,
  },
  nestedBackGlyph: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 36,
  },
  nestedHeaderText: {
    flex: 1,
  },
  nestedEyebrow: {
    color: '#FF9A59',
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  nestedTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
    marginTop: 1,
  },
  emptyGroupText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 18,
  },
  appIconContainer: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  appIconImage: {
    width: 60,
    height: 60,
    borderRadius: 14,
    marginBottom: 6,
  },
  appIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 6,
  },
  appIconText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  appIconLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 14,
  },
  testModeBar: {
    backgroundColor: '#FFA726',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  testModeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  floatingReturnButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 1000,
  },
  floatingReturnButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default ExternalAppOverlay;
