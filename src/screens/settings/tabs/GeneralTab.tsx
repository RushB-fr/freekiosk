/**
 * FreeKiosk v1.2 - General Tab
 * Display mode, URL/App selection, PIN configuration
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import {
  SettingsSection,
  SettingsInput,
  SettingsSwitch,
  SettingsModeSelector,
  SettingsInfoBox,
  SettingsButton,
  UrlListEditor,
  ScheduleEventList,
  ManagedAppsSection,
  SettingsRadioGroup,
} from '../../../components/settings';
import { ManagedApp } from '../../../types/managedApps';
import { Colors, Spacing, Typography } from '../../../theme';
import AppLauncherModule, { AppInfo } from '../../../utils/AppLauncherModule';
import { ScheduledEvent } from '../../../types/planner';
import type { MediaItem, MediaFitMode } from '../../../types/mediaPlayer';
import { generateMediaItemId, detectMediaType, isLocalMedia, getMediaDisplayName } from '../../../types/mediaPlayer';
import FilePickerModule from '../../../utils/FilePickerModule';
import type { PickedFile } from '../../../utils/FilePickerModule';

interface GeneralTabProps {
  // Display mode
  displayMode: 'webview' | 'external_app' | 'media_player';
  onDisplayModeChange: (mode: 'webview' | 'external_app' | 'media_player') => void;
  
  // WebView settings
  url: string;
  onUrlChange: (url: string) => void;
  
  // External app settings
  externalAppPackage: string;
  onExternalAppPackageChange: (pkg: string) => void;
  onPickApp: () => void;
  loadingApps: boolean;
  
  // External app sub-mode (single vs multi)
  externalAppMode: 'single' | 'multi';
  onExternalAppModeChange: (mode: 'single' | 'multi') => void;
  
  // Managed apps (multi-app mode)
  managedApps: ManagedApp[];
  onManagedAppsChange: (apps: ManagedApp[]) => void;
  
  // Permissions
  hasOverlayPermission: boolean;
  onRequestOverlayPermission: () => void;
  hasUsageStatsPermission: boolean;
  onRequestUsageStatsPermission: () => void;
  isDeviceOwner: boolean;
  
  // PIN
  pin: string;
  onPinChange: (pin: string) => void;
  isPinConfigured: boolean;
  pinModeChanged: boolean;
  pinMaxAttemptsText: string;
  onPinMaxAttemptsChange: (text: string) => void;
  onPinMaxAttemptsBlur: () => void;
  pinMode: 'numeric' | 'alphanumeric';
  onPinModeChange: (mode: 'numeric' | 'alphanumeric') => void;
  
  // Dashboard mode (webview only)
  dashboardModeEnabled: boolean;
  onDashboardModeEnabledChange: (value: boolean) => void;

  // Auto reload (webview only)
  autoReload: boolean;
  onAutoReloadChange: (value: boolean) => void;
  
  // PDF Viewer (webview only)
  pdfViewerEnabled: boolean;
  onPdfViewerEnabledChange: (value: boolean) => void;
  
  // Printing (webview only)
  printEnabled: boolean;
  onPrintEnabledChange: (value: boolean) => void;
  printPaperSize: string;
  onPrintPaperSizeChange: (value: string) => void;
  
  // URL Rotation (webview only)
  urlRotationEnabled: boolean;
  onUrlRotationEnabledChange: (value: boolean) => void;
  urlRotationList: string[];
  onUrlRotationListChange: (urls: string[]) => void;
  urlRotationInterval: string;
  onUrlRotationIntervalChange: (value: string) => void;
  
  // URL Planner (webview only)
  urlPlannerEnabled: boolean;
  onUrlPlannerEnabledChange: (value: boolean) => void;
  urlPlannerEvents: ScheduledEvent[];
  onUrlPlannerEventsChange: (events: ScheduledEvent[]) => void;
  onAddRecurringEvent: () => void;
  onAddOneTimeEvent: () => void;
  onEditEvent: (event: ScheduledEvent) => void;
  
  // WebView Back Button (webview only)
  webViewBackButtonEnabled: boolean;
  onWebViewBackButtonEnabledChange: (value: boolean) => void;
  webViewBackButtonXPercent: string;
  onWebViewBackButtonXPercentChange: (value: string) => void;
  webViewBackButtonYPercent: string;
  onWebViewBackButtonYPercentChange: (value: string) => void;
  onResetWebViewBackButtonPosition: () => void;
  
  // Inactivity Return to Home (webview only)
  inactivityReturnEnabled: boolean;
  onInactivityReturnEnabledChange: (value: boolean) => void;
  inactivityReturnDelay: string;
  onInactivityReturnDelayChange: (value: string) => void;
  inactivityReturnResetOnNav: boolean;
  onInactivityReturnResetOnNavChange: (value: boolean) => void;
  inactivityReturnClearCache: boolean;
  onInactivityReturnClearCacheChange: (value: boolean) => void;
  inactivityReturnScrollTop: boolean;
  onInactivityReturnScrollTopChange: (value: boolean) => void;
  
  // Media Player settings
  mediaPlayerItems: MediaItem[];
  onMediaPlayerItemsChange: (items: MediaItem[]) => void;
  mediaPlayerAutoPlay: boolean;
  onMediaPlayerAutoPlayChange: (value: boolean) => void;
  mediaPlayerLoop: boolean;
  onMediaPlayerLoopChange: (value: boolean) => void;
  mediaPlayerShuffle: boolean;
  onMediaPlayerShuffleChange: (value: boolean) => void;
  mediaPlayerImageDuration: string;
  onMediaPlayerImageDurationChange: (value: string) => void;
  mediaPlayerShowControls: boolean;
  onMediaPlayerShowControlsChange: (value: boolean) => void;
  mediaPlayerFitMode: MediaFitMode;
  onMediaPlayerFitModeChange: (value: MediaFitMode) => void;
  mediaPlayerBgColor: string;
  onMediaPlayerBgColorChange: (value: string) => void;
  mediaPlayerTransition: boolean;
  onMediaPlayerTransitionChange: (value: boolean) => void;
  mediaPlayerTransitionDuration: string;
  onMediaPlayerTransitionDurationChange: (value: string) => void;
  mediaPlayerMute: boolean;
  onMediaPlayerMuteChange: (value: boolean) => void;
  onPickMediaFromDevice: (type: 'video' | 'image' | 'any') => void;
  pickingMedia: boolean;
  
  // Navigation
  onBackToKiosk: () => void;
}

const GeneralTab: React.FC<GeneralTabProps> = ({
  displayMode,
  onDisplayModeChange,
  url,
  onUrlChange,
  externalAppPackage,
  onExternalAppPackageChange,
  onPickApp,
  loadingApps,
  externalAppMode,
  onExternalAppModeChange,
  managedApps,
  onManagedAppsChange,
  hasOverlayPermission,
  onRequestOverlayPermission,
  hasUsageStatsPermission,
  onRequestUsageStatsPermission,
  isDeviceOwner,
  pin,
  onPinChange,
  isPinConfigured,
  pinModeChanged,
  pinMaxAttemptsText,
  onPinMaxAttemptsChange,
  onPinMaxAttemptsBlur,
  pinMode,
  onPinModeChange,
  dashboardModeEnabled,
  onDashboardModeEnabledChange,
  autoReload,
  onAutoReloadChange,
  pdfViewerEnabled,
  onPdfViewerEnabledChange,
  printEnabled,
  onPrintEnabledChange,
  printPaperSize,
  onPrintPaperSizeChange,
  urlRotationEnabled,
  onUrlRotationEnabledChange,
  urlRotationList,
  onUrlRotationListChange,
  urlRotationInterval,
  onUrlRotationIntervalChange,
  urlPlannerEnabled,
  onUrlPlannerEnabledChange,
  urlPlannerEvents,
  onUrlPlannerEventsChange,
  onAddRecurringEvent,
  onAddOneTimeEvent,
  onEditEvent,
  webViewBackButtonEnabled,
  onWebViewBackButtonEnabledChange,
  webViewBackButtonXPercent,
  onWebViewBackButtonXPercentChange,
  webViewBackButtonYPercent,
  onWebViewBackButtonYPercentChange,
  onResetWebViewBackButtonPosition,
  inactivityReturnEnabled,
  onInactivityReturnEnabledChange,
  inactivityReturnDelay,
  onInactivityReturnDelayChange,
  inactivityReturnResetOnNav,
  onInactivityReturnResetOnNavChange,
  inactivityReturnClearCache,
  onInactivityReturnClearCacheChange,
  inactivityReturnScrollTop,
  onInactivityReturnScrollTopChange,
  mediaPlayerItems,
  onMediaPlayerItemsChange,
  mediaPlayerAutoPlay,
  onMediaPlayerAutoPlayChange,
  mediaPlayerLoop,
  onMediaPlayerLoopChange,
  mediaPlayerShuffle,
  onMediaPlayerShuffleChange,
  mediaPlayerImageDuration,
  onMediaPlayerImageDurationChange,
  mediaPlayerShowControls,
  onMediaPlayerShowControlsChange,
  mediaPlayerFitMode,
  onMediaPlayerFitModeChange,
  mediaPlayerBgColor,
  onMediaPlayerBgColorChange,
  mediaPlayerTransition,
  onMediaPlayerTransitionChange,
  mediaPlayerTransitionDuration,
  onMediaPlayerTransitionDurationChange,
  mediaPlayerMute,
  onMediaPlayerMuteChange,
  onPickMediaFromDevice,
  pickingMedia,
  onBackToKiosk,
}) => {
  return (
    <View>
      {/* Display Mode Selection */}
      <SettingsSection title="Display Mode" icon="cellphone">
        <SettingsModeSelector
          options={[
            { value: 'webview', label: 'Website', icon: 'web' },
            { value: 'media_player', label: 'Media', icon: 'play-circle-outline' },
            { value: 'external_app', label: 'App', icon: 'android' },
          ]}
          value={displayMode}
          onValueChange={(value) => onDisplayModeChange(value as 'webview' | 'external_app' | 'media_player')}
          hint="Website, media player (video/images), or Android application"
        />
        
        {/* Device Owner warning for External App */}
        {displayMode === 'external_app' && !isDeviceOwner && (
          <SettingsInfoBox variant="error" title="🔒 Device Owner Recommended">
            <Text style={styles.infoText}>
              Without Device Owner:{`
`}
              • Navigation buttons remain accessible{`
`}
              • User can exit the app freely{`
`}
              • Lock mode may not work properly
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>
      
      {/* How to Use */}
      <SettingsSection variant="info">
        <Text style={styles.infoTitle}>ℹ️ How to Use</Text>
        <Text style={styles.infoText}>
          {displayMode === 'media_player' 
            ? '• Add video or image URLs to build a playlist\n• Configure playback options (loop, shuffle, etc.)\n• Set a secure PIN code\n• Enable "Lock Mode" for full kiosk mode\n• Tap 5 times to access settings'
            : `• Configure the URL of the web page to display\n• Set a secure PIN code\n• Enable "Lock Mode" for full kiosk mode\n• Tap 5 times on the secret button to access settings (default: bottom-right)\n• Enter PIN code to unlock`}
        </Text>
      </SettingsSection>
      
      {/* ===== MEDIA PLAYER SETTINGS ===== */}
      {displayMode === 'media_player' && (
        <>
          {/* Media Items / Playlist */}
          <SettingsSection title="Media Playlist" icon="play-circle-outline">
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {'🎬 Add media from your device or via URL.\n'}
                {'Supported: MP4, WebM, OGG (video) • JPG, PNG, GIF, WebP, SVG (image)\n\n'}
                {'📱 Local files are copied to app storage for reliable playback.'}
              </Text>
            </SettingsInfoBox>
            
            {/* Pick from device buttons */}
            <View style={styles.pickButtonsRow}>
              <TouchableOpacity
                style={[styles.pickButton, pickingMedia && styles.pickButtonDisabled]}
                onPress={() => !pickingMedia && onPickMediaFromDevice('any')}
                disabled={pickingMedia}
              >
                <Text style={styles.pickButtonText}>
                  {pickingMedia ? '⏳ Picking...' : '📁 Pick from Device'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickButtonSmall, { backgroundColor: Colors.info }, pickingMedia && styles.pickButtonDisabled]}
                onPress={() => !pickingMedia && onPickMediaFromDevice('video')}
                disabled={pickingMedia}
              >
                <Text style={styles.pickButtonSmallText}>🎥</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickButtonSmall, { backgroundColor: Colors.secondary }, pickingMedia && styles.pickButtonDisabled]}
                onPress={() => !pickingMedia && onPickMediaFromDevice('image')}
                disabled={pickingMedia}
              >
                <Text style={styles.pickButtonSmallText}>🖼️</Text>
              </TouchableOpacity>
            </View>
            
            {mediaPlayerItems.map((item, index) => (
              <View key={item.id} style={styles.mediaItemCard}>
                <View style={styles.mediaItemHeader}>
                  <Text style={styles.mediaItemIndex}>{index + 1}</Text>
                  <View style={[
                    styles.mediaItemTypeBadge,
                    { backgroundColor: item.type === 'video' ? Colors.info : Colors.secondary }
                  ]}>
                    <Text style={styles.mediaItemTypeText}>
                      {item.type === 'video' ? '🎥 Video' : '🖼️ Image'}
                    </Text>
                  </View>
                  {item.isLocal && (
                    <View style={styles.localBadge}>
                      <Text style={styles.localBadgeText}>📱 Local</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.mediaItemDeleteBtn}
                    onPress={() => {
                      const toDelete = mediaPlayerItems.find(i => i.id === item.id);
                      // If it's a local file, also delete the copied file
                      if (toDelete?.isLocal && toDelete.url.startsWith('file://')) {
                        FilePickerModule.deleteMediaFile(toDelete.url).catch(() => {});
                      }
                      const updated = mediaPlayerItems.filter(i => i.id !== item.id);
                      onMediaPlayerItemsChange(updated);
                    }}
                  >
                    <Text style={styles.mediaItemDeleteText}>✗</Text>
                  </TouchableOpacity>
                </View>
                
                {item.isLocal ? (
                  <View style={styles.localFileInfo}>
                    <Text style={styles.localFileName} numberOfLines={1}>
                      {getMediaDisplayName(item)}
                    </Text>
                    <Text style={styles.localFilePath} numberOfLines={1}>
                      {item.url}
                    </Text>
                  </View>
                ) : (
                  <SettingsInput
                    label="URL"
                    value={item.url}
                    onChangeText={(text) => {
                      const updated = mediaPlayerItems.map(i => 
                        i.id === item.id ? { ...i, url: text, type: detectMediaType(text) } : i
                      );
                      onMediaPlayerItemsChange(updated);
                    }}
                    placeholder="https://example.com/video.mp4"
                    keyboardType="url"
                  />
                )}
                
                {item.type === 'image' && (
                  <SettingsInput
                    label="Display Duration (seconds)"
                    value={item.duration ? String(item.duration) : ''}
                    onChangeText={(text) => {
                      const dur = parseInt(text, 10);
                      const updated = mediaPlayerItems.map(i => 
                        i.id === item.id ? { ...i, duration: isNaN(dur) ? undefined : dur } : i
                      );
                      onMediaPlayerItemsChange(updated);
                    }}
                    placeholder={mediaPlayerImageDuration || '10'}
                    keyboardType="numeric"
                    hint="Leave empty to use default duration"
                  />
                )}
              </View>
            ))}
            
            <SettingsButton
              title="Add URL Entry"
              icon="plus-circle"
              variant="success"
              onPress={() => {
                const newItem: MediaItem = {
                  id: generateMediaItemId(),
                  url: '',
                  type: 'video',
                  isLocal: false,
                };
                onMediaPlayerItemsChange([...mediaPlayerItems, newItem]);
              }}
            />
            
            {mediaPlayerItems.length === 0 && (
              <SettingsInfoBox variant="warning">
                <Text style={styles.infoText}>
                  ⚠️ Add at least one media item to use the Media Player
                </Text>
              </SettingsInfoBox>
            )}
          </SettingsSection>
          
          {/* Playback Settings */}
          <SettingsSection title="Playback" icon="play">
            <SettingsSwitch
              label="Auto Play"
              value={mediaPlayerAutoPlay}
              onValueChange={onMediaPlayerAutoPlayChange}
              hint="Automatically start playing when the screen loads"
            />
            
            <SettingsSwitch
              label="Loop Playlist"
              value={mediaPlayerLoop}
              onValueChange={onMediaPlayerLoopChange}
              hint="Restart the playlist from the beginning when it ends"
            />
            
            <SettingsSwitch
              label="Shuffle"
              value={mediaPlayerShuffle}
              onValueChange={onMediaPlayerShuffleChange}
              hint="Play items in random order"
            />
            
            <SettingsSwitch
              label="Mute Videos"
              value={mediaPlayerMute}
              onValueChange={onMediaPlayerMuteChange}
              hint="Play all videos without audio"
            />
            
            <View style={styles.rotationSpacer} />
            <SettingsInput
              label="Default Image Duration (seconds)"
              value={mediaPlayerImageDuration}
              onChangeText={onMediaPlayerImageDurationChange}
              placeholder="10"
              keyboardType="numeric"
              hint="How long to display each image (1-3600s). Per-image override available above."
            />
          </SettingsSection>
          
          {/* Display Settings */}
          <SettingsSection title="Display Options" icon="monitor">
            <SettingsSwitch
              label="Show Playback Controls"
              value={mediaPlayerShowControls}
              onValueChange={onMediaPlayerShowControlsChange}
              hint="Show play/pause, next/prev controls (tap screen to toggle)"
            />
            
            <View style={styles.rotationSpacer} />
            <SettingsRadioGroup
              label="Content Fit Mode"
              options={[
                { value: 'contain', label: 'Contain (fit within screen)' },
                { value: 'cover', label: 'Cover (fill screen, may crop)' },
                { value: 'fill', label: 'Fill (stretch to fit)' },
              ]}
              value={mediaPlayerFitMode}
              onValueChange={(v) => onMediaPlayerFitModeChange(v as MediaFitMode)}
            />
            
            <View style={styles.rotationSpacer} />
            <SettingsInput
              label="Background Color"
              value={mediaPlayerBgColor}
              onChangeText={onMediaPlayerBgColorChange}
              placeholder="#000000"
              hint="Hex color for areas not covered by media (e.g. #000000 for black)"
            />
            
            <View style={styles.rotationSpacer} />
            <SettingsSwitch
              label="Crossfade Transition"
              value={mediaPlayerTransition}
              onValueChange={onMediaPlayerTransitionChange}
              hint="Smooth fade transition between media items"
            />
            
            {mediaPlayerTransition && (
              <SettingsInput
                label="Transition Duration (ms)"
                value={mediaPlayerTransitionDuration}
                onChangeText={onMediaPlayerTransitionDurationChange}
                placeholder="500"
                keyboardType="numeric"
                hint="Duration of the crossfade effect (0-3000ms)"
              />
            )}
          </SettingsSection>
        </>
      )}
      
      {/* URL Input (WebView mode) */}
      {displayMode === 'webview' && (
        <SettingsSection title="URL to Display" icon="link-variant">
          <SettingsSwitch
            label="Use Dashboard Mode"
            value={dashboardModeEnabled}
            onValueChange={onDashboardModeEnabledChange}
            hint="Replace single URL with a multi-URL dashboard"
          />

          {dashboardModeEnabled ? (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                Dashboard mode is active. Configure your tiles in the Dashboard tab.
              </Text>
            </SettingsInfoBox>
          ) : (
            <>
              <SettingsInput
                label=""
                value={url}
                onChangeText={onUrlChange}
                placeholder="https://example.com"
                keyboardType="url"
                hint="Example: https://www.freekiosk.app"
              />

              {url.trim().toLowerCase().startsWith('http://') && (
                <SettingsInfoBox variant="warning">
                  <Text style={styles.infoText}>
                    ⚠️ SECURITY: This URL uses HTTP (unencrypted).{`
`}
                    Your data can be intercepted. Use HTTPS instead.
                  </Text>
                </SettingsInfoBox>
              )}
            </>
          )}
        </SettingsSection>
      )}
      
      {/* URL Rotation (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title="URL Rotation" icon="sync">
          {dashboardModeEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                URL Rotation is disabled in Dashboard mode.
              </Text>
            </SettingsInfoBox>
          )}
          {!dashboardModeEnabled && (
            <>
              <SettingsSwitch
                label="Enable Rotation"
                value={urlRotationEnabled}
                onValueChange={onUrlRotationEnabledChange}
                hint="Automatically cycle through multiple URLs"
              />

              {urlRotationEnabled && (
                <>
                  <View style={styles.rotationSpacer} />
                  <UrlListEditor
                    urls={urlRotationList}
                    onUrlsChange={onUrlRotationListChange}
                  />

                  <View style={styles.rotationSpacer} />
                  <SettingsInput
                    label="Rotation Interval (seconds)"
                    value={urlRotationInterval}
                    onChangeText={onUrlRotationIntervalChange}
                    placeholder="30"
                    keyboardType="numeric"
                    hint="Time between each URL change (minimum 5 seconds)"
                  />

                  {urlRotationList.length < 2 && (
                    <SettingsInfoBox variant="warning">
                      <Text style={styles.infoText}>
                        ⚠️ Add at least 2 URLs to enable rotation
                      </Text>
                    </SettingsInfoBox>
                  )}
                </>
              )}
            </>
          )}
        </SettingsSection>
      )}
      
      {/* URL Planner (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title="URL Planner" icon="calendar-clock">
          <SettingsSwitch
            label="Enable Scheduled URLs"
            value={urlPlannerEnabled}
            onValueChange={onUrlPlannerEnabledChange}
            hint="Display specific URLs at scheduled times"
          />
          
          {urlPlannerEnabled && (
            <>
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  📌 Scheduled events take priority over URL Rotation.{`
`}
                  One-time events take priority over recurring events.
                </Text>
              </SettingsInfoBox>
              
              <View style={styles.rotationSpacer} />
              
              <ScheduleEventList
                events={urlPlannerEvents}
                onEventsChange={onUrlPlannerEventsChange}
                onAddRecurring={onAddRecurringEvent}
                onAddOneTime={onAddOneTimeEvent}
                onEditEvent={onEditEvent}
              />
            </>
          )}
        </SettingsSection>
      )}
      
      {/* External App Sub-Mode Selection */}
      {displayMode === 'external_app' && (
        <>
          <SettingsSection title="App Mode" icon="apps">
            <SettingsModeSelector
              options={[
                { value: 'single', label: 'Single App', icon: 'cellphone' },
                { value: 'multi', label: 'Multi App', icon: 'view-grid', badge: 'BETA', badgeColor: Colors.warning },
              ]}
              value={externalAppMode}
              onValueChange={(value) => onExternalAppModeChange(value as 'single' | 'multi')}
              hint={externalAppMode === 'single'
                ? 'Launch a single app in kiosk mode (classic behavior)'
                : 'Display a home screen grid with multiple apps'}
            />
          </SettingsSection>
          
          {/* Single App: classic package name + picker */}
          {externalAppMode === 'single' && (
            <SettingsSection title="Application" icon="cellphone-link">
              <SettingsInput
                label="Package Name"
                value={externalAppPackage}
                onChangeText={onExternalAppPackageChange}
                placeholder="com.example.app"
                hint="Enter package name or select an app"
              />
              
              <SettingsButton
                title={loadingApps ? 'Loading...' : 'Choose an Application'}
                icon="format-list-bulleted"
                variant="success"
                onPress={onPickApp}
                disabled={loadingApps}
                loading={loadingApps}
              />
            </SettingsSection>
          )}
          
          {/* Multi App: managed apps grid */}
          {externalAppMode === 'multi' && (
            <SettingsSection title="Applications" icon="view-grid">
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {'📱 Add apps to display on the home screen grid.\n'}
                  {'Users can choose which app to launch.\n\n'}
                  {'Toggle options per app: show on home screen, launch on boot, keep alive, accessibility.'}
                </Text>
              </SettingsInfoBox>
              <ManagedAppsSection
                managedApps={managedApps}
                onManagedAppsChange={onManagedAppsChange}
                isDeviceOwner={isDeviceOwner}
              />
            </SettingsSection>
          )}
          
          {/* Managed Apps for Single App mode (optional, for background/accessibility features) */}
          {externalAppMode === 'single' && (
            <SettingsSection title="Additional Managed Apps" icon="apps">
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {'📋 Optional: add extra apps for background monitoring, boot launch, or accessibility whitelist.\n'}
                  {'These apps will NOT appear on the home screen in single app mode.'}
                </Text>
              </SettingsInfoBox>
              <ManagedAppsSection
                managedApps={managedApps}
                onManagedAppsChange={onManagedAppsChange}
                isDeviceOwner={isDeviceOwner}
              />
            </SettingsSection>
          )}
          
          {/* Overlay Permission */}
          <SettingsSection
            variant={hasOverlayPermission ? 'success' : 'warning'}
          >
            <View style={styles.permissionRow}>
              <View style={styles.permissionTextContainer}>
                <Text style={[styles.permissionTitle, { color: hasOverlayPermission ? Colors.successDark : Colors.warningDark }]}>
                  {hasOverlayPermission ? '✓ Return Button Enabled' : '⚠️ Overlay Permission Required'}
                </Text>
                <Text style={styles.permissionHint}>
                  {hasOverlayPermission
                    ? "The return button will be functional on the external app."
                    : "Enable permission to use the return button on the app."}
                </Text>
              </View>
            </View>
            
            {!hasOverlayPermission && (
              <SettingsButton
                title="Enable Permission"
                variant="success"
                onPress={onRequestOverlayPermission}
              />
            )}
          </SettingsSection>
          
          {/* Usage Stats Permission - required for auto-relaunch monitoring */}
          <SettingsSection
            variant={hasUsageStatsPermission ? 'success' : 'warning'}
          >
            <View style={styles.permissionRow}>
              <View style={styles.permissionTextContainer}>
                <Text style={[styles.permissionTitle, { color: hasUsageStatsPermission ? Colors.successDark : Colors.warningDark }]}>
                  {hasUsageStatsPermission ? '✓ Usage Access Granted' : '⚠️ Usage Access Required'}
                </Text>
                <Text style={styles.permissionHint}>
                  {hasUsageStatsPermission
                    ? "Auto-relaunch monitoring is active. FreeKiosk can detect when the external app closes."
                    : "Required for auto-relaunch. Without this, FreeKiosk cannot detect when the external app closes or crashes."}
                </Text>
              </View>
            </View>
            
            {!hasUsageStatsPermission && (
              <SettingsButton
                title="Grant Usage Access"
                variant="warning"
                onPress={onRequestUsageStatsPermission}
              />
            )}
          </SettingsSection>
        </>
      )}
      
      {/* Password Configuration */}
      <SettingsSection title="Password" icon="pin">
        <SettingsSwitch
          label="Advanced Password Mode"
          hint="Enable alphanumeric passwords with special characters. Disable for numeric PIN only (4-6 digits)."
          value={pinMode === 'alphanumeric'}
          onValueChange={(enabled) => onPinModeChange(enabled ? 'alphanumeric' : 'numeric')}
        />
        
        <SettingsInput
          label=""
          value={pin}
          onChangeText={onPinChange}
          placeholder={isPinConfigured && !pinModeChanged ? '••••' : '1234'}
          keyboardType={pinMode === 'alphanumeric' ? 'default' : 'numeric'}
          secureTextEntry
          maxLength={pinMode === 'alphanumeric' ? undefined : 6}
          autoCapitalize={pinMode === 'alphanumeric' ? 'none' : undefined}
          error={pinModeChanged && !pin ? '⚠️ New password required after mode change' : undefined}
          hint={pinModeChanged
            ? '⚠️ Mode changed - You MUST enter a new password'
            : isPinConfigured
              ? '✓ Password configured - Leave empty to keep current password'
              : pinMode === 'alphanumeric'
                ? 'Minimum 4 characters. Can include letters, numbers, and special characters.'
                : 'Numeric PIN: 4-6 digits (default: 1234)'}
        />
        
        <View style={styles.pinAttemptsContainer}>
          <SettingsInput
            label="🔒 Max Attempts Before Lockout (15min)"
            value={pinMaxAttemptsText}
            onChangeText={onPinMaxAttemptsChange}
            onBlur={onPinMaxAttemptsBlur}
            keyboardType="numeric"
            maxLength={3}
            placeholder="5"
            hint="Number of incorrect password attempts allowed (1-100)"
          />
        </View>
      </SettingsSection>
      
      {/* Inactivity Return to Home - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Inactivity Return" icon="timer-sand">
          <SettingsSwitch
            label="Return to Start Page on Inactivity"
            value={inactivityReturnEnabled}
            onValueChange={onInactivityReturnEnabledChange}
            hint="Automatically navigate back to the start URL when the screen hasn't been touched for a set duration"
          />
          
          {inactivityReturnEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsInput
                label="Inactivity Timeout (seconds)"
                value={inactivityReturnDelay}
                onChangeText={onInactivityReturnDelayChange}
                placeholder="60"
                keyboardType="numeric"
                hint="Time in seconds before returning to start page (5-3600)"
              />
              
              <View style={styles.rotationSpacer} />
              <SettingsSwitch
                label="Reset Timer on Page Load"
                value={inactivityReturnResetOnNav}
                onValueChange={onInactivityReturnResetOnNavChange}
                hint="Restart the inactivity timer when a new page loads within the WebView"
              />
              
              <SettingsSwitch
                label="Clear Cache on Return"
                value={inactivityReturnClearCache}
                onValueChange={onInactivityReturnClearCacheChange}
                hint="Clear the WebView cache when returning to the start page (full reload)"
              />
              
              <SettingsSwitch
                label="Scroll to Top on Start Page"
                value={inactivityReturnScrollTop}
                onValueChange={onInactivityReturnScrollTopChange}
                hint="Smoothly scroll back to the top of the page when already on the start page"
              />
              
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  ℹ️ The timer resets on every touch interaction.{`\n`}
                  If already on the start page and scroll-to-top is enabled, the page will scroll up.{`\n`}
                  Disabled during URL Rotation, URL Planner, and Screensaver.
                </Text>
              </SettingsInfoBox>
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Auto Reload - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Auto Reload" icon="refresh">
          <SettingsSwitch
            label="Reload on Error"
            hint="Automatically reload the page on network error"
            value={autoReload}
            onValueChange={onAutoReloadChange}
          />
        </SettingsSection>
      )}
      
      {/* PDF Viewer - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="PDF Viewer" icon="file-pdf-box">
          <SettingsSwitch
            label="Inline PDF Viewer"
            hint="Display PDF files directly in the browser instead of downloading them"
            value={pdfViewerEnabled}
            onValueChange={onPdfViewerEnabledChange}
          />
          
          {pdfViewerEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {'📄 PDF links will open in a built-in viewer with page navigation and zoom controls.\n\n'}
                {'⚠️ Enabling this feature allows file access in the WebView for the local PDF renderer. Only enable if your kiosk website links to PDF files.'}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}
      
      {/* Printing - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Printing" icon="printer">
          <SettingsSwitch
            label="Allow Printing"
            hint="Enable window.print() support for web pages (label printers, receipts, etc.)"
            value={printEnabled}
            onValueChange={onPrintEnabledChange}
          />
          
          {printEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsRadioGroup
                label="Default Paper Size"
                options={[
                  { value: 'A4',     label: 'A4 (210 × 297 mm)' },
                  { value: 'A5',     label: 'A5 (148 × 210 mm)' },
                  { value: 'A3',     label: 'A3 (297 × 420 mm)' },
                  { value: 'LETTER', label: 'Letter (8.5 × 11 in)' },
                  { value: 'LEGAL',  label: 'Legal (8.5 × 14 in)' },
                ]}
                value={printPaperSize}
                onValueChange={onPrintPaperSizeChange}
              />
            </>
          )}

          {printEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {'🖨️ Web pages can trigger the Android print dialog via window.print().\n\n'}
                {'In Device Owner (kiosk) mode, the system print spooler is automatically whitelisted to allow the print dialog to appear.\n\n'}
                {'Supports WiFi, Bluetooth, USB printers, and Save as PDF.'}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}
      
      {/* WebView Back Button - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Web Navigation Button" icon="arrow-left-circle">
          <SettingsSwitch
            label="Enable Back Button"
            hint="Show a floating button to navigate back in web history (NOT app navigation)"
            value={webViewBackButtonEnabled}
            onValueChange={onWebViewBackButtonEnabledChange}
          />
          
          {webViewBackButtonEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  ℹ️ This button only navigates within the web page history.{`
`}
                  It will NOT exit the kiosk mode or return to settings.
                </Text>
              </SettingsInfoBox>
              
              <View style={styles.rotationSpacer} />
              <SettingsInput
                label="Position X (%)"
                value={webViewBackButtonXPercent}
                onChangeText={onWebViewBackButtonXPercentChange}
                placeholder="2"
                keyboardType="numeric"
                hint="Horizontal position: 0% (left) to 100% (right)"
              />
              
              <SettingsInput
                label="Position Y (%)"
                value={webViewBackButtonYPercent}
                onChangeText={onWebViewBackButtonYPercentChange}
                placeholder="10"
                keyboardType="numeric"
                hint="Vertical position: 0% (top) to 100% (bottom)"
              />
              
              <SettingsButton
                title="Reset to Default Position"
                icon="restore"
                variant="outline"
                onPress={onResetWebViewBackButtonPosition}
              />
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Background Apps - WebView mode only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Background Apps" icon="apps">
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              {'📋 Optional: add apps to launch and keep running in the background while the kiosk WebView is displayed.\n\n'}
              {'Example: keep a music or audio receiver app alive alongside your web dashboard.'}
            </Text>
          </SettingsInfoBox>
          <ManagedAppsSection
            managedApps={managedApps}
            onManagedAppsChange={onManagedAppsChange}
            isDeviceOwner={isDeviceOwner}
            showHomeScreenToggle={false}
          />
        </SettingsSection>
      )}

      {/* Back to Kiosk Button */}
      <SettingsButton
        title="Back to Kiosk"
        icon="arrow-u-left-top"
        variant="outline"
        onPress={onBackToKiosk}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  infoText: {
    ...Typography.body,
    lineHeight: 22,
  },
  infoTitle: {
    ...Typography.label,
    color: Colors.infoDark,
    marginBottom: Spacing.sm,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionTextContainer: {
    flex: 1,
  },
  permissionTitle: {
    ...Typography.label,
    marginBottom: 4,
  },
  permissionHint: {
    ...Typography.hint,
  },
  pinAttemptsContainer: {
    marginTop: Spacing.lg,
  },
  rotationSpacer: {
    height: Spacing.md,
  },
  mediaItemCard: {
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  mediaItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  mediaItemIndex: {
    ...Typography.label,
    color: Colors.textSecondary,
    width: 24,
    textAlign: 'center',
    fontSize: 14,
  },
  mediaItemTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  mediaItemTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  mediaItemDeleteBtn: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaItemDeleteText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: 'bold',
  },
  pickButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  pickButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickButtonDisabled: {
    opacity: 0.5,
  },
  pickButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  pickButtonSmall: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickButtonSmallText: {
    fontSize: 20,
  },
  localBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: Colors.successLight,
    marginLeft: 6,
  },
  localBadgeText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '600',
  },
  localFileInfo: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  localFileName: {
    ...Typography.label,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  localFilePath: {
    ...Typography.body,
    color: Colors.textSecondary,
    fontSize: 11,
  },
});

export default GeneralTab;
