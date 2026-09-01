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
import Icon from '../../../components/Icon';
import { Colors, Spacing, Typography } from '../../../theme';
import AppLauncherModule, { AppInfo } from '../../../utils/AppLauncherModule';
import { ScheduledEvent } from '../../../types/planner';
import type { MediaItem, MediaFitMode } from '../../../types/mediaPlayer';
import { generateMediaItemId, detectMediaType, isLocalMedia, getMediaDisplayName } from '../../../types/mediaPlayer';
import FilePickerModule from '../../../utils/FilePickerModule';
import type { PickedFile } from '../../../utils/FilePickerModule';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '../../../i18n';

interface GeneralTabProps {
  // Language
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;

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
  
  // HTTP Basic Auth (webview only)
  basicAuthUsername: string;
  onBasicAuthUsernameChange: (value: string) => void;
  basicAuthPassword: string;
  onBasicAuthPasswordChange: (value: string) => void;

  // Navigation
  onBackToKiosk: () => void;
}

const GeneralTab: React.FC<GeneralTabProps> = ({
  language,
  onLanguageChange,
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
  basicAuthUsername,
  onBasicAuthUsernameChange,
  basicAuthPassword,
  onBasicAuthPasswordChange,
  onBackToKiosk,
}) => {
  const { t } = useTranslation();

  return (
    <View>
      {/* Language / Langue */}
      <SettingsSection title={t('general.language.title')} icon="translate">
        <SettingsRadioGroup
          label={t('general.language.label')}
          options={[
            { value: 'en', label: 'English' },
            { value: 'fr', label: 'Français' },
          ]}
          value={language}
          onValueChange={(v) => onLanguageChange(v as SupportedLanguage)}
        />
      </SettingsSection>

      {/* Display Mode Selection */}
      <SettingsSection title={t('general.displayMode.title')} icon="cellphone">
        <SettingsModeSelector
          options={[
            { value: 'webview', label: t('general.displayMode.website'), icon: 'web' },
            { value: 'media_player', label: t('general.displayMode.media'), icon: 'play-circle-outline' },
            { value: 'external_app', label: t('general.displayMode.app'), icon: 'android' },
          ]}
          value={displayMode}
          onValueChange={(value) => onDisplayModeChange(value as 'webview' | 'external_app' | 'media_player')}
          hint={t('general.displayMode.hint')}
        />

        {/* Device Owner warning for External App */}
        {displayMode === 'external_app' && !isDeviceOwner && (
          <SettingsInfoBox variant="error" icon="shield-alert" title={t('general.displayMode.deviceOwnerWarningTitle')}>
            <Text style={styles.infoText}>
              {t('general.displayMode.deviceOwnerWarningBody')}
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>

      {/* How to Use */}
      <SettingsSection variant="info">
        <Text style={styles.infoTitle}>{t('general.howToUse.title')}</Text>
        <Text style={styles.infoText}>
          {displayMode === 'media_player'
            ? t('general.howToUse.media')
            : t('general.howToUse.webview')}
        </Text>
      </SettingsSection>
      
      {/* ===== MEDIA PLAYER SETTINGS ===== */}
      {displayMode === 'media_player' && (
        <>
          {/* Media Items / Playlist */}
          <SettingsSection title={t('general.mediaPlaylist.title')} icon="play-circle-outline">
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('general.mediaPlaylist.info')}
              </Text>
            </SettingsInfoBox>

            {/* Pick from device buttons */}
            <View style={styles.pickButtonsRow}>
              <TouchableOpacity
                style={[styles.pickButton, pickingMedia && styles.pickButtonDisabled]}
                onPress={() => !pickingMedia && onPickMediaFromDevice('any')}
                disabled={pickingMedia}
              >
                <View style={styles.pickButtonRow}>
                  <Icon name="folder-open-outline" size={18} color={Colors.textOnPrimary} style={styles.pickButtonIcon} />
                  <Text style={styles.pickButtonText}>
                    {pickingMedia ? t('general.mediaPlaylist.picking') : t('general.mediaPlaylist.pickFromDevice')}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickButtonSmall, { backgroundColor: Colors.info }, pickingMedia && styles.pickButtonDisabled]}
                onPress={() => !pickingMedia && onPickMediaFromDevice('video')}
                disabled={pickingMedia}
              >
                <Icon name="video-outline" size={20} color={Colors.textOnPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickButtonSmall, { backgroundColor: Colors.secondary }, pickingMedia && styles.pickButtonDisabled]}
                onPress={() => !pickingMedia && onPickMediaFromDevice('image')}
                disabled={pickingMedia}
              >
                <Icon name="image-outline" size={20} color={Colors.textOnPrimary} />
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
                      {item.type === 'video' ? t('general.mediaPlaylist.video') : t('general.mediaPlaylist.image')}
                    </Text>
                  </View>
                  {item.isLocal && (
                    <View style={styles.localBadge}>
                      <Text style={styles.localBadgeText}>{t('general.mediaPlaylist.local')}</Text>
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
                    <Icon name="close" size={18} color={Colors.error} />
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
                    label={t('general.mediaPlaylist.urlLabel')}
                    value={item.url}
                    onChangeText={(text) => {
                      const updated = mediaPlayerItems.map(i =>
                        i.id === item.id ? { ...i, url: text, type: detectMediaType(text) } : i
                      );
                      onMediaPlayerItemsChange(updated);
                    }}
                    placeholder={t('general.mediaPlaylist.urlPlaceholder')}
                    keyboardType="url"
                  />
                )}

                {item.type === 'image' && (
                  <SettingsInput
                    label={t('general.mediaPlaylist.durationLabel')}
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
                    hint={t('general.mediaPlaylist.durationHint')}
                  />
                )}
              </View>
            ))}

            <SettingsButton
              title={t('general.mediaPlaylist.addUrlEntry')}
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
                  {t('general.mediaPlaylist.emptyWarning')}
                </Text>
              </SettingsInfoBox>
            )}
          </SettingsSection>

          {/* Playback Settings */}
          <SettingsSection title={t('general.playback.title')} icon="play">
            <SettingsSwitch
              label={t('general.playback.autoPlay')}
              value={mediaPlayerAutoPlay}
              onValueChange={onMediaPlayerAutoPlayChange}
              hint={t('general.playback.autoPlayHint')}
            />

            <SettingsSwitch
              label={t('general.playback.loop')}
              value={mediaPlayerLoop}
              onValueChange={onMediaPlayerLoopChange}
              hint={t('general.playback.loopHint')}
            />

            <SettingsSwitch
              label={t('general.playback.shuffle')}
              value={mediaPlayerShuffle}
              onValueChange={onMediaPlayerShuffleChange}
              hint={t('general.playback.shuffleHint')}
            />

            <SettingsSwitch
              label={t('general.playback.mute')}
              value={mediaPlayerMute}
              onValueChange={onMediaPlayerMuteChange}
              hint={t('general.playback.muteHint')}
            />

            <View style={styles.rotationSpacer} />
            <SettingsInput
              label={t('general.playback.defaultDuration')}
              value={mediaPlayerImageDuration}
              onChangeText={onMediaPlayerImageDurationChange}
              placeholder="10"
              keyboardType="numeric"
              hint={t('general.playback.defaultDurationHint')}
            />
          </SettingsSection>

          {/* Display Settings */}
          <SettingsSection title={t('general.displayOptions.title')} icon="monitor">
            <SettingsSwitch
              label={t('general.displayOptions.showControls')}
              value={mediaPlayerShowControls}
              onValueChange={onMediaPlayerShowControlsChange}
              hint={t('general.displayOptions.showControlsHint')}
            />

            <View style={styles.rotationSpacer} />
            <SettingsRadioGroup
              label={t('general.displayOptions.fitMode')}
              options={[
                { value: 'contain', label: t('general.displayOptions.fitContain') },
                { value: 'cover', label: t('general.displayOptions.fitCover') },
                { value: 'fill', label: t('general.displayOptions.fitFill') },
              ]}
              value={mediaPlayerFitMode}
              onValueChange={(v) => onMediaPlayerFitModeChange(v as MediaFitMode)}
            />

            <View style={styles.rotationSpacer} />
            <SettingsInput
              label={t('general.displayOptions.bgColor')}
              value={mediaPlayerBgColor}
              onChangeText={onMediaPlayerBgColorChange}
              placeholder="#000000"
              hint={t('general.displayOptions.bgColorHint')}
            />

            <View style={styles.rotationSpacer} />
            <SettingsSwitch
              label={t('general.displayOptions.crossfade')}
              value={mediaPlayerTransition}
              onValueChange={onMediaPlayerTransitionChange}
              hint={t('general.displayOptions.crossfadeHint')}
            />

            {mediaPlayerTransition && (
              <SettingsInput
                label={t('general.displayOptions.transitionDuration')}
                value={mediaPlayerTransitionDuration}
                onChangeText={onMediaPlayerTransitionDurationChange}
                placeholder="500"
                keyboardType="numeric"
                hint={t('general.displayOptions.transitionDurationHint')}
              />
            )}
          </SettingsSection>
        </>
      )}
      
      {/* URL Input (WebView mode) */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.urlSection.title')} icon="link-variant">
          <SettingsSwitch
            label={t('general.urlSection.dashboardMode')}
            value={dashboardModeEnabled}
            onValueChange={onDashboardModeEnabledChange}
            hint={t('general.urlSection.dashboardModeHint')}
          />

          {dashboardModeEnabled ? (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('general.urlSection.dashboardActive')}
              </Text>
            </SettingsInfoBox>
          ) : (
            <>
              <SettingsInput
                label=""
                value={url}
                onChangeText={onUrlChange}
                placeholder={t('general.urlSection.placeholder')}
                keyboardType="url"
                hint={t('general.urlSection.hint')}
              />

              {url.trim().toLowerCase().startsWith('http://') && (
                <SettingsInfoBox variant="warning">
                  <Text style={styles.infoText}>
                    {t('general.urlSection.httpWarning')}
                  </Text>
                </SettingsInfoBox>
              )}
            </>
          )}
        </SettingsSection>
      )}

      {/* HTTP Basic Auth (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.auth.title')} icon="lock-outline">
          <SettingsInput
            label={t('general.auth.username')}
            value={basicAuthUsername}
            onChangeText={onBasicAuthUsernameChange}
            placeholder={t('general.auth.usernamePlaceholder')}
            hint={t('general.auth.usernameHint')}
            autoCapitalize="none"
          />
          {basicAuthUsername.trim().length > 0 && (
            <SettingsInput
              label={t('general.auth.password')}
              value={basicAuthPassword}
              onChangeText={onBasicAuthPasswordChange}
              placeholder={t('general.auth.passwordPlaceholder')}
              secureTextEntry={true}
              hint={t('general.auth.passwordHint')}
              autoCapitalize="none"
            />
          )}
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              {t('general.auth.info')}
            </Text>
          </SettingsInfoBox>
        </SettingsSection>
      )}

      {/* URL Rotation (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.urlRotation.title')} icon="sync">
          {dashboardModeEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('general.urlRotation.disabledInDashboard')}
              </Text>
            </SettingsInfoBox>
          )}
          {!dashboardModeEnabled && (
            <>
              <SettingsSwitch
                label={t('general.urlRotation.enable')}
                value={urlRotationEnabled}
                onValueChange={onUrlRotationEnabledChange}
                hint={t('general.urlRotation.enableHint')}
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
                    label={t('general.urlRotation.interval')}
                    value={urlRotationInterval}
                    onChangeText={onUrlRotationIntervalChange}
                    placeholder="30"
                    keyboardType="numeric"
                    hint={t('general.urlRotation.intervalHint')}
                  />

                  {urlRotationList.length < 2 && (
                    <SettingsInfoBox variant="warning">
                      <Text style={styles.infoText}>
                        {t('general.urlRotation.needTwoUrls')}
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
        <SettingsSection title={t('general.urlPlanner.title')} icon="calendar-clock">
          <SettingsSwitch
            label={t('general.urlPlanner.enable')}
            value={urlPlannerEnabled}
            onValueChange={onUrlPlannerEnabledChange}
            hint={t('general.urlPlanner.enableHint')}
          />

          {urlPlannerEnabled && (
            <>
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('general.urlPlanner.priorityInfo')}
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
          <SettingsSection title={t('general.appMode.title')} icon="apps">
            <SettingsModeSelector
              options={[
                { value: 'single', label: t('general.appMode.single'), icon: 'cellphone' },
                { value: 'multi', label: t('general.appMode.multi'), icon: 'view-grid', badge: 'BETA', badgeColor: Colors.warning },
              ]}
              value={externalAppMode}
              onValueChange={(value) => onExternalAppModeChange(value as 'single' | 'multi')}
              hint={externalAppMode === 'single'
                ? t('general.appMode.singleHint')
                : t('general.appMode.multiHint')}
            />
          </SettingsSection>

          {/* Single App: classic package name + picker */}
          {externalAppMode === 'single' && (
            <SettingsSection title={t('general.application.title')} icon="cellphone-link">
              <SettingsInput
                label={t('general.application.packageName')}
                value={externalAppPackage}
                onChangeText={onExternalAppPackageChange}
                placeholder={t('general.application.packageNamePlaceholder')}
                hint={t('general.application.packageNameHint')}
              />

              <SettingsButton
                title={loadingApps ? t('general.application.loading') : t('general.application.choose')}
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
            <SettingsSection title={t('general.applications.title')} icon="view-grid">
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('general.applications.info')}
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
            <SettingsSection title={t('general.additionalApps.title')} icon="apps">
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('general.additionalApps.info')}
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
                  {hasOverlayPermission ? t('general.overlayPermission.enabled') : t('general.overlayPermission.required')}
                </Text>
                <Text style={styles.permissionHint}>
                  {hasOverlayPermission
                    ? t('general.overlayPermission.enabledHint')
                    : t('general.overlayPermission.requiredHint')}
                </Text>
              </View>
            </View>

            {!hasOverlayPermission && (
              <SettingsButton
                title={t('general.overlayPermission.enableButton')}
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
                  {hasUsageStatsPermission ? t('general.usageStats.granted') : t('general.usageStats.required')}
                </Text>
                <Text style={styles.permissionHint}>
                  {hasUsageStatsPermission
                    ? t('general.usageStats.grantedHint')
                    : t('general.usageStats.requiredHint')}
                </Text>
              </View>
            </View>

            {!hasUsageStatsPermission && (
              <SettingsButton
                title={t('general.usageStats.grantButton')}
                variant="warning"
                onPress={onRequestUsageStatsPermission}
              />
            )}
          </SettingsSection>
        </>
      )}
      
      {/* Password Configuration */}
      <SettingsSection title={t('general.password.title')} icon="pin">
        <SettingsSwitch
          label={t('general.password.advancedMode')}
          hint={t('general.password.advancedModeHint')}
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
          error={pinModeChanged && !pin ? t('general.password.errorNewRequired') : undefined}
          hint={pinModeChanged
            ? t('general.password.hintModeChanged')
            : isPinConfigured
              ? t('general.password.hintConfigured')
              : pinMode === 'alphanumeric'
                ? t('general.password.hintAlphanumeric')
                : t('general.password.hintNumeric')}
        />

        <View style={styles.pinAttemptsContainer}>
          <SettingsInput
            icon="lock"
            label={t('general.password.maxAttempts')}
            value={pinMaxAttemptsText}
            onChangeText={onPinMaxAttemptsChange}
            onBlur={onPinMaxAttemptsBlur}
            keyboardType="numeric"
            maxLength={3}
            placeholder="5"
            hint={t('general.password.maxAttemptsHint')}
          />
        </View>
      </SettingsSection>

      {/* Inactivity Return to Home - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.inactivityReturn.title')} icon="timer-sand">
          <SettingsSwitch
            label={t('general.inactivityReturn.enable')}
            value={inactivityReturnEnabled}
            onValueChange={onInactivityReturnEnabledChange}
            hint={t('general.inactivityReturn.enableHint')}
          />

          {inactivityReturnEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsInput
                label={t('general.inactivityReturn.timeout')}
                value={inactivityReturnDelay}
                onChangeText={onInactivityReturnDelayChange}
                placeholder="60"
                keyboardType="numeric"
                hint={t('general.inactivityReturn.timeoutHint')}
              />

              <View style={styles.rotationSpacer} />
              <SettingsSwitch
                label={t('general.inactivityReturn.resetOnLoad')}
                value={inactivityReturnResetOnNav}
                onValueChange={onInactivityReturnResetOnNavChange}
                hint={t('general.inactivityReturn.resetOnLoadHint')}
              />

              <SettingsSwitch
                label={t('general.inactivityReturn.clearCache')}
                value={inactivityReturnClearCache}
                onValueChange={onInactivityReturnClearCacheChange}
                hint={t('general.inactivityReturn.clearCacheHint')}
              />

              <SettingsSwitch
                label={t('general.inactivityReturn.scrollTop')}
                value={inactivityReturnScrollTop}
                onValueChange={onInactivityReturnScrollTopChange}
                hint={t('general.inactivityReturn.scrollTopHint')}
              />

              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('general.inactivityReturn.info')}
                </Text>
              </SettingsInfoBox>
            </>
          )}
        </SettingsSection>
      )}

      {/* Auto Reload - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.autoReload.title')} icon="refresh">
          <SettingsSwitch
            label={t('general.autoReload.reloadOnError')}
            hint={t('general.autoReload.reloadOnErrorHint')}
            value={autoReload}
            onValueChange={onAutoReloadChange}
          />
        </SettingsSection>
      )}

      {/* PDF Viewer - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.pdfViewer.title')} icon="file-pdf-box">
          <SettingsSwitch
            label={t('general.pdfViewer.enable')}
            hint={t('general.pdfViewer.enableHint')}
            value={pdfViewerEnabled}
            onValueChange={onPdfViewerEnabledChange}
          />

          {pdfViewerEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('general.pdfViewer.info')}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}
      
      {/* Printing - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.printing.title')} icon="printer">
          <SettingsSwitch
            label={t('general.printing.allow')}
            hint={t('general.printing.allowHint')}
            value={printEnabled}
            onValueChange={onPrintEnabledChange}
          />

          {printEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsRadioGroup
                label={t('general.printing.paperSize')}
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
                {t('general.printing.info')}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}

      {/* WebView Back Button - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('general.webNav.title')} icon="arrow-left-circle">
          <SettingsSwitch
            label={t('general.webNav.enable')}
            hint={t('general.webNav.enableHint')}
            value={webViewBackButtonEnabled}
            onValueChange={onWebViewBackButtonEnabledChange}
          />

          {webViewBackButtonEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('general.webNav.info')}
                </Text>
              </SettingsInfoBox>

              <View style={styles.rotationSpacer} />
              <SettingsInput
                label={t('general.webNav.positionX')}
                value={webViewBackButtonXPercent}
                onChangeText={onWebViewBackButtonXPercentChange}
                placeholder="2"
                keyboardType="numeric"
                hint={t('general.webNav.positionXHint')}
              />

              <SettingsInput
                label={t('general.webNav.positionY')}
                value={webViewBackButtonYPercent}
                onChangeText={onWebViewBackButtonYPercentChange}
                placeholder="10"
                keyboardType="numeric"
                hint={t('general.webNav.positionYHint')}
              />

              <SettingsButton
                title={t('general.webNav.resetPosition')}
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
        <SettingsSection title={t('general.backgroundApps.title')} icon="apps">
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              {t('general.backgroundApps.info')}
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
        title={t('general.backToKiosk')}
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickButtonIcon: {
    marginRight: 8,
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
    borderRadius: 12,
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
