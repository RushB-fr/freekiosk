/**
 * FreeKiosk v1.2 - Security Tab
 * Lock mode, Auto-launch, External app behavior
 */

import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import {
  SettingsSection,
  SettingsSwitch,
  SettingsRadioGroup,
  SettingsInput,
  SettingsInfoBox,
  SettingsButton,
  SettingsModeSelector,
  UrlListEditor,
} from '../../../components/settings';
import { Colors, Spacing, Typography } from '../../../theme';
import { useTranslation } from 'react-i18next';

interface SecurityTabProps {
  displayMode: 'webview' | 'external_app' | 'media_player';
  isDeviceOwner: boolean;
  navigation?: any; // Navigation prop for sub-screens
  
  // Lock mode
  kioskEnabled: boolean;
  onKioskEnabledChange: (value: boolean) => void;
  
  // Power button
  allowPowerButton: boolean;
  onAllowPowerButtonChange: (value: boolean) => void;

  // Block factory reset (Device Owner only) (#201)
  blockFactoryReset: boolean;
  onBlockFactoryResetChange: (value: boolean) => void;

  // Allow remote screenshots (Device Owner only) (#229)
  allowRemoteScreenshot: boolean;
  onAllowRemoteScreenshotChange: (value: boolean) => void;
  
  // Notifications (NFC support)
  allowNotifications: boolean;
  onAllowNotificationsChange: (value: boolean) => void;
  
  // System Info (audio fix for Samsung)
  allowSystemInfo: boolean;
  onAllowSystemInfoChange: (value: boolean) => void;
  
  // Return to Settings
  returnMode: string; // 'tap_anywhere' | 'button'
  onReturnModeChange: (value: string) => void;
  returnTapCount: string;
  onReturnTapCountChange: (value: string) => void;
  returnTapTimeout: string;
  onReturnTapTimeoutChange: (value: string) => void;
  returnButtonPosition: string; // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  onReturnButtonPositionChange: (value: string) => void;
  overlayButtonVisible: boolean;
  onOverlayButtonVisibleChange: (value: boolean) => void;
  volumeUp5TapEnabled: boolean;
  onVolumeUp5TapEnabledChange: (value: boolean) => void;
  
  // Auto launch
  autoLaunchEnabled: boolean;
  onAutoLaunchChange: (value: boolean) => void;
  onOpenSystemSettings: () => void;

  // System screen-lock compatibility (#199)
  screenLockCompatEnabled: boolean;
  onScreenLockCompatChange: (value: boolean) => void;

  // Default launcher / persistent Home (#199)
  defaultLauncherEnabled: boolean;
  onDefaultLauncherChange: (value: boolean) => void;
  
  // External app specific
  autoRelaunchApp: boolean;
  onAutoRelaunchAppChange: (value: boolean) => void;
  backButtonMode: string;
  onBackButtonModeChange: (value: string) => void;
  backButtonTimerDelay: string;
  onBackButtonTimerDelayChange: (value: string) => void;
  
  // URL Filtering
  urlFilterEnabled: boolean;
  onUrlFilterEnabledChange: (value: boolean) => void;
  urlFilterMode: string; // 'blacklist' | 'whitelist'
  onUrlFilterModeChange: (value: string) => void;
  urlFilterList: string[];
  onUrlFilterListChange: (patterns: string[]) => void;
  urlFilterShowFeedback: boolean;
  onUrlFilterShowFeedbackChange: (value: boolean) => void;

  // Lock Screen Controls
  lockscreenControlsEnabled: boolean;
  onLockscreenControlsEnabledChange: (value: boolean) => void;
  lockscreenWifiEnabled: boolean;
  onLockscreenWifiEnabledChange: (value: boolean) => void;
  lockscreenBluetoothEnabled: boolean;
  onLockscreenBluetoothEnabledChange: (value: boolean) => void;
  lockscreenEmergencyCallEnabled: boolean;
  onLockscreenEmergencyCallEnabledChange: (value: boolean) => void;
  lockscreenAudioEnabled: boolean;
  onLockscreenAudioEnabledChange: (value: boolean) => void;
  lockscreenFlashlightEnabled: boolean;
  onLockscreenFlashlightEnabledChange: (value: boolean) => void;
  lockscreenBrightnessEnabled: boolean;
  onLockscreenBrightnessEnabledChange: (value: boolean) => void;
  lockscreenRotationLockEnabled: boolean;
  onLockscreenRotationLockEnabledChange: (value: boolean) => void;
  lockscreenRotationLockAvailable: boolean;
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  displayMode,
  isDeviceOwner,
  navigation,
  kioskEnabled,
  onKioskEnabledChange,
  allowPowerButton,
  onAllowPowerButtonChange,
  blockFactoryReset,
  onBlockFactoryResetChange,
  allowRemoteScreenshot,
  onAllowRemoteScreenshotChange,
  allowNotifications,
  onAllowNotificationsChange,
  allowSystemInfo,
  onAllowSystemInfoChange,
  returnMode,
  onReturnModeChange,
  returnTapCount,
  onReturnTapCountChange,
  returnTapTimeout,
  onReturnTapTimeoutChange,
  returnButtonPosition,
  onReturnButtonPositionChange,
  overlayButtonVisible,
  onOverlayButtonVisibleChange,
  volumeUp5TapEnabled,
  onVolumeUp5TapEnabledChange,
  autoLaunchEnabled,
  onAutoLaunchChange,
  onOpenSystemSettings,
  screenLockCompatEnabled,
  onScreenLockCompatChange,
  defaultLauncherEnabled,
  onDefaultLauncherChange,
  autoRelaunchApp,
  onAutoRelaunchAppChange,
  backButtonMode,
  onBackButtonModeChange,
  backButtonTimerDelay,
  onBackButtonTimerDelayChange,
  urlFilterEnabled,
  onUrlFilterEnabledChange,
  urlFilterMode,
  onUrlFilterModeChange,
  urlFilterList,
  onUrlFilterListChange,
  urlFilterShowFeedback,
  onUrlFilterShowFeedbackChange,
  lockscreenControlsEnabled,
  onLockscreenControlsEnabledChange,
  lockscreenWifiEnabled,
  onLockscreenWifiEnabledChange,
  lockscreenBluetoothEnabled,
  onLockscreenBluetoothEnabledChange,
  lockscreenEmergencyCallEnabled,
  onLockscreenEmergencyCallEnabledChange,
  lockscreenAudioEnabled,
  onLockscreenAudioEnabledChange,
  lockscreenFlashlightEnabled,
  onLockscreenFlashlightEnabledChange,
  lockscreenBrightnessEnabled,
  onLockscreenBrightnessEnabledChange,
  lockscreenRotationLockEnabled,
  onLockscreenRotationLockEnabledChange,
  lockscreenRotationLockAvailable,
}) => {
  const { t } = useTranslation();

  return (
    <View>
      {/* Lock Mode */}
      <SettingsSection title={t('security.lockMode.title')} icon="lock">
        <SettingsSwitch
          label={t('security.lockMode.enable')}
          hint={t('security.lockMode.enableHint')}
          value={kioskEnabled}
          onValueChange={onKioskEnabledChange}
        />

        {!kioskEnabled && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              {t('security.lockMode.disabledWarning')}
            </Text>
          </SettingsInfoBox>
        )}

        {kioskEnabled && (displayMode === 'webview' || displayMode === 'media_player') && isDeviceOwner && (
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              {t('security.lockMode.screenPinningInfo')}
            </Text>
          </SettingsInfoBox>
        )}

        {kioskEnabled && (displayMode === 'webview' || displayMode === 'media_player') && !isDeviceOwner && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              {t('security.lockMode.noDeviceOwnerWarning')}
            </Text>
          </SettingsInfoBox>
        )}

        {kioskEnabled && displayMode === 'external_app' && !isDeviceOwner && (
          <SettingsInfoBox variant="error">
            <Text style={styles.infoText}>
              {t('security.lockMode.externalAppNoOwnerError')}
            </Text>
          </SettingsInfoBox>
        )}

        {kioskEnabled && displayMode === 'external_app' && isDeviceOwner && (
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              {t('security.lockMode.externalAppOwnerInfo')}
            </Text>
          </SettingsInfoBox>
        )}

        {/* Power Button Setting - Only show when Lock Mode is enabled and Device Owner */}
        {kioskEnabled && isDeviceOwner && (
          <>
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockMode.blockPowerMenu')}
              hint={t('security.lockMode.blockPowerMenuHint')}
              value={!allowPowerButton}
              onValueChange={(value) => onAllowPowerButtonChange(!value)}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockMode.allowNotifications')}
              icon="nfc"
              hint={t('security.lockMode.allowNotificationsHint')}
              value={allowNotifications}
              onValueChange={onAllowNotificationsChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockMode.showSystemInfo')}
              icon="information-outline"
              hint={t('security.lockMode.showSystemInfoHint')}
              value={allowSystemInfo}
              onValueChange={onAllowSystemInfoChange}
            />
          </>
        )}

        {/* Block factory reset — Device Owner only, independent of Lock Mode (#201) */}
        {isDeviceOwner && (
          <>
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockMode.blockFactoryReset')}
              icon="lock-reset"
              hint={t('security.lockMode.blockFactoryResetHint')}
              value={blockFactoryReset}
              onValueChange={onBlockFactoryResetChange}
            />
          </>
        )}

        {/* Allow remote screenshots (#229) - Device Owner only */}
        {isDeviceOwner && (
          <>
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockMode.allowRemoteScreenshots')}
              icon="camera-outline"
              hint={t('security.lockMode.allowRemoteScreenshotsHint')}
              value={allowRemoteScreenshot}
              onValueChange={onAllowRemoteScreenshotChange}
            />
            {allowRemoteScreenshot && (
              <SettingsInfoBox variant="warning">
                <Text style={styles.infoText}>
                  {t('security.lockMode.remoteScreenshotWarning')}
                </Text>
              </SettingsInfoBox>
            )}
          </>
        )}
      </SettingsSection>
      
      {/* Auto Launch */}
      <SettingsSection title={t('security.autoLaunch.title')} icon="rocket-launch">
        <SettingsSwitch
          label={t('security.autoLaunch.launchOnBoot')}
          hint={t('security.autoLaunch.launchOnBootHint')}
          value={autoLaunchEnabled}
          onValueChange={onAutoLaunchChange}
        />

        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            {t('security.autoLaunch.appearOnTopInfo')}
          </Text>
        </SettingsInfoBox>

        <SettingsButton
          title={t('security.autoLaunch.openSystemSettings')}
          icon="cog-outline"
          variant="primary"
          onPress={onOpenSystemSettings}
        />

        {/* System screen-lock compatibility — Device Owner only (#199) */}
        {isDeviceOwner && (
          <>
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.autoLaunch.screenLockCompat')}
              icon="shield-lock"
              hint={t('security.autoLaunch.screenLockCompatHint')}
              value={screenLockCompatEnabled}
              onValueChange={onScreenLockCompatChange}
            />
            {screenLockCompatEnabled && (
              <SettingsInfoBox variant="warning">
                <Text style={styles.infoText}>
                  {t('security.autoLaunch.screenLockCompatWarning')}
                </Text>
              </SettingsInfoBox>
            )}
          </>
        )}

        {/* Default launcher / persistent Home (#199) — works with or without Device Owner */}
        <View style={styles.divider} />
        <SettingsSwitch
          label={t('security.autoLaunch.defaultLauncher')}
          icon="home"
          hint={isDeviceOwner
            ? t('security.autoLaunch.defaultLauncherHintOwner')
            : t('security.autoLaunch.defaultLauncherHintNonOwner')}
          value={defaultLauncherEnabled}
          onValueChange={onDefaultLauncherChange}
        />
        {defaultLauncherEnabled && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              {isDeviceOwner
                ? t('security.autoLaunch.defaultLauncherWarningOwner')
                : t('security.autoLaunch.defaultLauncherWarningNonOwner')}
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>
      
      {/* Return to Settings */}
      <SettingsSection title={t('security.returnToSettings.title')} icon="gesture-tap">
        <SettingsRadioGroup
          hint={t('security.returnToSettings.hint')}
          options={[
            {
              value: 'tap_anywhere',
              label: t('security.returnToSettings.tapAnywhere'),
              icon: 'gesture-tap',
              hint: t('security.returnToSettings.tapAnywhereHint'),
            },
            {
              value: 'button',
              label: t('security.returnToSettings.fixedButton'),
              icon: 'square-outline',
              hint: t('security.returnToSettings.fixedButtonHint'),
            },
          ]}
          value={returnMode}
          onValueChange={onReturnModeChange}
        />
        <View style={styles.divider} />

        <SettingsInput
          label={t('security.returnToSettings.numTaps')}
          hint={returnMode === 'button' ? t('security.returnToSettings.numTapsHintButton') : t('security.returnToSettings.numTapsHintAnywhere')}
          value={returnTapCount}
          onChangeText={(text) => {
            const filtered = text.replace(/[^0-9]/g, '');
            onReturnTapCountChange(filtered);
          }}
          keyboardType="numeric"
          placeholder="5"
          maxLength={2}
          error={returnTapCount !== '' && (parseInt(returnTapCount, 10) < 2 || parseInt(returnTapCount, 10) > 20) ? t('security.returnToSettings.numTapsError') : undefined}
        />

        <SettingsInput
          label={t('security.returnToSettings.timeout')}
          hint={t('security.returnToSettings.timeoutHint')}
          value={returnTapTimeout}
          onChangeText={(text) => {
            const filtered = text.replace(/[^0-9]/g, '');
            onReturnTapTimeoutChange(filtered);
          }}
          keyboardType="numeric"
          placeholder="1500"
          maxLength={4}
          error={returnTapTimeout !== '' && (parseInt(returnTapTimeout, 10) < 500 || parseInt(returnTapTimeout, 10) > 5000) ? t('security.returnToSettings.timeoutError') : undefined}
        />

        {returnMode === 'button' && (
          <>
            <View style={styles.divider} />
            {displayMode === 'external_app' && (
              <>
                <SettingsRadioGroup
                  hint={t('security.returnToSettings.buttonPositionHint')}
                  options={[
                    { value: 'top-left', label: t('security.returnToSettings.topLeft'), icon: 'arrow-top-left' },
                    { value: 'top-right', label: t('security.returnToSettings.topRight'), icon: 'arrow-top-right' },
                    { value: 'bottom-left', label: t('security.returnToSettings.bottomLeft'), icon: 'arrow-bottom-left' },
                    { value: 'bottom-right', label: t('security.returnToSettings.bottomRight'), icon: 'arrow-bottom-right' },
                  ]}
                  value={returnButtonPosition}
                  onValueChange={onReturnButtonPositionChange}
                />
                <View style={styles.divider} />
              </>
            )}
            <SettingsSwitch
              label={t('security.returnToSettings.showButton')}
              icon="eye"
              hint={displayMode === 'external_app'
                ? t('security.returnToSettings.showButtonHintExternal')
                : t('security.returnToSettings.showButtonHintOther')}
              value={overlayButtonVisible}
              onValueChange={onOverlayButtonVisibleChange}
            />
          </>
        )}

        <>
          <View style={styles.divider} />
          <SettingsSwitch
            label={t('security.returnToSettings.volumeAlt')}
            icon="volume-high"
            hint={displayMode === 'external_app'
              ? t('security.returnToSettings.volumeAltHintExternal')
              : t('security.returnToSettings.volumeAltHintOther')}
            value={volumeUp5TapEnabled}
            onValueChange={onVolumeUp5TapEnabledChange}
          />
        </>

        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            {returnMode === 'button' && displayMode === 'external_app'
              ? t('security.returnToSettings.infoButtonMode', { position: returnButtonPosition, count: returnTapCount || '5' })
              : t('security.returnToSettings.infoAnywhereMode', { count: returnTapCount || '5', timeout: returnTapTimeout ? `${(parseInt(returnTapTimeout, 10) / 1000).toFixed(1)}s` : '1.5s' })}
            {kioskEnabled && t('security.returnToSettings.pinRequired')}
          </Text>
        </SettingsInfoBox>
      </SettingsSection>
      
      {/* Touch Blocking Overlays - Works without Device Owner but less secure */}
      <SettingsSection title={t('security.touchBlocking.title')} icon="gesture-tap-button">
        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            {t('security.touchBlocking.info', { target: displayMode === 'webview' ? t('security.touchBlocking.website') : t('security.touchBlocking.externalApps') })}
          </Text>
        </SettingsInfoBox>

        {(!kioskEnabled || !isDeviceOwner) && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              {t('security.touchBlocking.warningNoLockMode')}
            </Text>
          </SettingsInfoBox>
        )}

        <SettingsButton
          title={t('security.touchBlocking.configureButton')}
          icon="rectangle-outline"
          variant="primary"
          onPress={() => navigation?.navigate('BlockingOverlays')}
        />

        {kioskEnabled && isDeviceOwner && (
          <SettingsInfoBox variant="success">
            <Text style={styles.infoText}>
              {t('security.touchBlocking.maxSecurity')}
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>

      {/* URL Filtering - Blacklist/Whitelist (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('security.urlFiltering.title')} icon="shield-lock">
          <SettingsSwitch
            label={t('security.urlFiltering.enable')}
            hint={t('security.urlFiltering.enableHint')}
            value={urlFilterEnabled}
            onValueChange={onUrlFilterEnabledChange}
          />

          {urlFilterEnabled && (
            <>
              <View style={styles.divider} />

              <SettingsModeSelector
                label={t('security.urlFiltering.filterMode')}
                options={[
                  {
                    value: 'blacklist',
                    label: t('security.urlFiltering.blacklist'),
                    icon: 'close-circle',
                  },
                  {
                    value: 'whitelist',
                    label: t('security.urlFiltering.whitelist'),
                    icon: 'check-circle-outline',
                  },
                ]}
                value={urlFilterMode}
                onValueChange={onUrlFilterModeChange}
                hint={urlFilterMode === 'blacklist'
                  ? t('security.urlFiltering.blacklistHint')
                  : t('security.urlFiltering.whitelistHint')}
              />

              <View style={styles.divider} />

              <UrlListEditor
                urls={urlFilterList}
                onUrlsChange={onUrlFilterListChange}
                maxUrls={0}
                patternMode={true}
                placeholder={urlFilterMode === 'blacklist' ? '*facebook.com*' : '*mysite.com/*'}
                emptyTitle={t('security.urlFiltering.emptyTitle')}
                emptyHint={urlFilterMode === 'blacklist'
                  ? t('security.urlFiltering.emptyHintBlacklist')
                  : t('security.urlFiltering.emptyHintWhitelist')}
              />

              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('security.urlFiltering.wildcardInfo')}
                </Text>
              </SettingsInfoBox>

              <SettingsInfoBox variant="success">
                <Text style={styles.infoText}>
                  {t('security.urlFiltering.mainUrlAlwaysAllowed')}
                </Text>
              </SettingsInfoBox>

              <View style={styles.divider} />

              <SettingsSwitch
                label={t('security.urlFiltering.showBlockedNotif')}
                hint={t('security.urlFiltering.showBlockedNotifHint')}
                value={urlFilterShowFeedback}
                onValueChange={onUrlFilterShowFeedbackChange}
              />
            </>
          )}
        </SettingsSection>
      )}
      
      {/* External App Specific Settings */}
      {displayMode === 'external_app' && (
        <>
          {/* Auto Relaunch */}
          <SettingsSection title={t('security.externalAppBehavior.title')} icon="application">
            <SettingsSwitch
              label={t('security.externalAppBehavior.autoRelaunch')}
              icon="restart"
              hint={t('security.externalAppBehavior.autoRelaunchHint')}
              value={autoRelaunchApp}
              onValueChange={onAutoRelaunchAppChange}
            />
          </SettingsSection>

          {/* Back Button Behavior */}
          <SettingsSection title={t('security.backButton.title')} icon="undo">
            <SettingsRadioGroup
              hint={t('security.backButton.hint')}
              options={[
                {
                  value: 'test',
                  label: t('security.backButton.testMode'),
                  icon: 'test-tube',
                  hint: t('security.backButton.testModeHint'),
                },
                {
                  value: 'immediate',
                  label: t('security.backButton.immediate'),
                  icon: 'flash',
                  hint: t('security.backButton.immediateHint'),
                },
                {
                  value: 'timer',
                  label: t('security.backButton.delayed'),
                  icon: 'timer',
                  hint: t('security.backButton.delayedHint'),
                },
              ]}
              value={backButtonMode}
              onValueChange={onBackButtonModeChange}
            />

            {backButtonMode === 'timer' && (
              <View style={styles.timerInput}>
                <SettingsInput
                  label={t('security.backButton.delayLabel')}
                  value={backButtonTimerDelay}
                  onChangeText={(text) => {
                    const num = text.replace(/[^0-9]/g, '');
                    onBackButtonTimerDelayChange(num);
                  }}
                  keyboardType="numeric"
                  placeholder="10"
                  maxLength={4}
                />
              </View>
            )}
          </SettingsSection>
        </>
      )}
      
      {/* Lock Screen Controls */}
      <SettingsSection title={t('security.lockScreenControls.title')} icon="lock">
        <SettingsSwitch
          label={t('security.lockScreenControls.enable')}
          hint={t('security.lockScreenControls.enableHint')}
          value={lockscreenControlsEnabled}
          onValueChange={onLockscreenControlsEnabledChange}
        />
        {lockscreenControlsEnabled && (
          <>
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('security.lockScreenControls.info')}
              </Text>
            </SettingsInfoBox>
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockScreenControls.wifi')}
              icon="wifi"
              hint={t('security.lockScreenControls.wifiHint')}
              value={lockscreenWifiEnabled}
              onValueChange={onLockscreenWifiEnabledChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockScreenControls.bluetooth')}
              icon="bluetooth"
              hint={t('security.lockScreenControls.bluetoothHint')}
              value={lockscreenBluetoothEnabled}
              onValueChange={onLockscreenBluetoothEnabledChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockScreenControls.emergencyCall')}
              icon="phone"
              hint={t('security.lockScreenControls.emergencyCallHint')}
              value={lockscreenEmergencyCallEnabled}
              onValueChange={onLockscreenEmergencyCallEnabledChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockScreenControls.audio')}
              icon="volume-high"
              hint={t('security.lockScreenControls.audioHint')}
              value={lockscreenAudioEnabled}
              onValueChange={onLockscreenAudioEnabledChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockScreenControls.flashlight')}
              icon="flashlight"
              hint={t('security.lockScreenControls.flashlightHint')}
              value={lockscreenFlashlightEnabled}
              onValueChange={onLockscreenFlashlightEnabledChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockScreenControls.brightness')}
              icon="white-balance-sunny"
              hint={t('security.lockScreenControls.brightnessHint')}
              value={lockscreenBrightnessEnabled}
              onValueChange={onLockscreenBrightnessEnabledChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label={t('security.lockScreenControls.rotationLock')}
              icon="screen-rotation"
              hint={
                lockscreenRotationLockAvailable
                  ? t('security.lockScreenControls.rotationLockHintAvailable')
                  : t('security.lockScreenControls.rotationLockHintUnavailable')
              }
              value={lockscreenRotationLockAvailable && lockscreenRotationLockEnabled}
              onValueChange={onLockscreenRotationLockEnabledChange}
              disabled={!lockscreenRotationLockAvailable}
            />
          </>
        )}
      </SettingsSection>

      {/* Return Mechanism Info - Always visible */}
      <SettingsSection variant="info">
        <Text style={styles.infoTitle}>{t('security.returnInfo.title')}</Text>
        <Text style={styles.infoText}>
          {displayMode === 'external_app' && returnMode === 'button'
            ? t('security.returnInfo.buttonLine', {
                position: returnButtonPosition,
                count: returnTapCount || '5',
                invisible: overlayButtonVisible ? '' : t('security.returnInfo.invisible'),
              })
            : t('security.returnInfo.anywhereLine', {
                count: returnTapCount || '5',
                timeout: returnTapTimeout ? `${(parseInt(returnTapTimeout, 10) / 1000).toFixed(1)}s` : '1.5s',
                visual: overlayButtonVisible ? t('security.returnInfo.visualIndicator') : '',
              })}
          {displayMode === 'external_app' && '\n' + t('security.returnInfo.recentApps')}
          {(displayMode === 'webview' || displayMode === 'media_player') && volumeUp5TapEnabled && '\n' + t('security.returnInfo.volumeAlt', { count: returnTapCount || '5' })}
        </Text>
      </SettingsSection>
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
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.md,
  },
  timerInput: {
    marginTop: Spacing.md,
    paddingLeft: Spacing.xxl,
  },
});

export default SecurityTab;
