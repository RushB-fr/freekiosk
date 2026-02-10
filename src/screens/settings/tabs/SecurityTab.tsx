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

interface SecurityTabProps {
  displayMode: 'webview' | 'external_app';
  isDeviceOwner: boolean;
  navigation?: any; // Navigation prop for sub-screens
  
  // Lock mode
  kioskEnabled: boolean;
  onKioskEnabledChange: (value: boolean) => void;
  
  // Power button
  allowPowerButton: boolean;
  onAllowPowerButtonChange: (value: boolean) => void;
  
  // Notifications (NFC support)
  allowNotifications: boolean;
  onAllowNotificationsChange: (value: boolean) => void;
  
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
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  displayMode,
  isDeviceOwner,
  navigation,
  kioskEnabled,
  onKioskEnabledChange,
  allowPowerButton,
  onAllowPowerButtonChange,
  allowNotifications,
  onAllowNotificationsChange,
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
}) => {
  return (
    <View>
      {/* Lock Mode */}
      <SettingsSection title="Lock Mode" icon="lock">
        <SettingsSwitch
          label="Enable Lock Mode"
          hint="Prevent users from exiting the kiosk app. Requires PIN code to exit."
          value={kioskEnabled}
          onValueChange={onKioskEnabledChange}
        />
        
        {!kioskEnabled && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              ⚠️ With Lock Mode disabled, users can exit the app normally
            </Text>
          </SettingsInfoBox>
        )}
        
        {kioskEnabled && displayMode === 'webview' && isDeviceOwner && (
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              ℹ️ Screen pinning enabled: Only 5-tap gesture + PIN code allows exit
            </Text>
          </SettingsInfoBox>
        )}
        
        {kioskEnabled && displayMode === 'webview' && !isDeviceOwner && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              ⚠️ Without Device Owner, users can exit via Back + Recent Apps gesture. Set FreeKiosk as Device Owner for complete lockdown.
            </Text>
          </SettingsInfoBox>
        )}
        
        {kioskEnabled && displayMode === 'external_app' && !isDeviceOwner && (
          <SettingsInfoBox variant="error">
            <Text style={styles.infoText}>
              ⚠️ Device Owner required: Lock Mode will not work in External App mode without Device Owner privileges.
            </Text>
          </SettingsInfoBox>
        )}
        
        {kioskEnabled && displayMode === 'external_app' && isDeviceOwner && (
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              ℹ️ Lock Mode enabled: Only 5-tap anywhere on screen + PIN code allows exit from external app
            </Text>
          </SettingsInfoBox>
        )}
        
        {/* Power Button Setting - Only show when Lock Mode is enabled and Device Owner */}
        {kioskEnabled && isDeviceOwner && (
          <>
            <View style={styles.divider} />
            <SettingsSwitch
              label="🔌 Allow Power Menu"
              hint="When enabled, long-pressing the power button shows the power menu (Restart/Shutdown). When disabled, long-pressing the power button has no effect — it can only turn the screen on/off with a short press."
              value={allowPowerButton}
              onValueChange={onAllowPowerButtonChange}
            />
            <View style={styles.divider} />
            <SettingsSwitch
              label="📡 Allow Notifications (NFC)"
              hint="Enable notification dispatch to allow NFC tag reading in external apps. Note: this also makes the notification panel accessible."
              value={allowNotifications}
              onValueChange={onAllowNotificationsChange}
            />
          </>
        )}
      </SettingsSection>
      
      {/* Auto Launch */}
      <SettingsSection title="Auto Launch" icon="rocket-launch">
        <SettingsSwitch
          label="Launch on Boot"
          hint="Automatically launch FreeKiosk when the device starts"
          value={autoLaunchEnabled}
          onValueChange={onAutoLaunchChange}
        />
        
        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            ℹ️ Make sure "Appear on top" permission is enabled in system settings for reliable auto-launch.
          </Text>
        </SettingsInfoBox>
        
        <SettingsButton
          title="Open System Settings"
          icon="cog-outline"
          variant="primary"
          onPress={onOpenSystemSettings}
        />
      </SettingsSection>
      
      {/* Return to Settings */}
      <SettingsSection title="Return to Settings" icon="gesture-tap">
        <SettingsRadioGroup
          hint="Choose how to return to settings"
          options={[
            {
              value: 'tap_anywhere',
              label: 'Tap Anywhere',
              icon: 'gesture-tap',
              hint: 'Tap N times in the same area (taps must be grouped)',
            },
            {
              value: 'button',
              label: 'Fixed Button',
              icon: 'square-outline',
              hint: 'Tap N times on a corner button',
            },
          ]}
          value={returnMode}
          onValueChange={onReturnModeChange}
        />
        <View style={styles.divider} />
        
        <SettingsInput
          label="Number of Taps (2-20)"
          hint={returnMode === 'button' ? 'Tap this many times to access settings' : 'Tap anywhere on screen this many times rapidly to access settings'}
          value={returnTapCount}
          onChangeText={(text) => {
            const filtered = text.replace(/[^0-9]/g, '');
            onReturnTapCountChange(filtered);
          }}
          keyboardType="numeric"
          placeholder="5"
          maxLength={2}
          error={returnTapCount !== '' && (parseInt(returnTapCount, 10) < 2 || parseInt(returnTapCount, 10) > 20) ? 'Must be between 2 and 20' : undefined}
        />
        
        <SettingsInput
          label="Detection Timeout (500-5000 ms)"
          hint="Time window to complete all taps. Higher values make detection easier but may trigger accidentally."
          value={returnTapTimeout}
          onChangeText={(text) => {
            const filtered = text.replace(/[^0-9]/g, '');
            onReturnTapTimeoutChange(filtered);
          }}
          keyboardType="numeric"
          placeholder="1500"
          maxLength={4}
          error={returnTapTimeout !== '' && (parseInt(returnTapTimeout, 10) < 500 || parseInt(returnTapTimeout, 10) > 5000) ? 'Must be between 500 and 5000' : undefined}
        />
        
        {returnMode === 'button' && (
          <>
            <View style={styles.divider} />
            {displayMode === 'external_app' && (
              <>
                <SettingsRadioGroup
                  hint="Button position on screen"
                  options={[
                    { value: 'top-left', label: 'Top Left', icon: 'arrow-top-left' },
                    { value: 'top-right', label: 'Top Right', icon: 'arrow-top-right' },
                    { value: 'bottom-left', label: 'Bottom Left', icon: 'arrow-bottom-left' },
                    { value: 'bottom-right', label: 'Bottom Right', icon: 'arrow-bottom-right' },
                  ]}
                  value={returnButtonPosition}
                  onValueChange={onReturnButtonPositionChange}
                />
                <View style={styles.divider} />
              </>
            )}
            <SettingsSwitch
              label="👁️ Show Button"
              hint={displayMode === 'external_app' 
                ? "Make the return button visible. When hidden, it's still active but invisible." 
                : "Show a visual button indicator"}
              value={overlayButtonVisible}
              onValueChange={onOverlayButtonVisibleChange}
            />
          </>
        )}
        
        {displayMode === 'webview' && (
          <>
            <View style={styles.divider} />
            <SettingsSwitch
              label="🔊 Volume Button Alternative"
              hint="Also allow pressing Volume Up/Down button multiple times to access settings"
              value={volumeUp5TapEnabled}
              onValueChange={onVolumeUp5TapEnabledChange}
            />
          </>
        )}
        
        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            ℹ️ {returnMode === 'button' && displayMode === 'external_app' 
              ? `Tap the return button (${returnButtonPosition}) ${returnTapCount || '5'} times to access settings`
              : `Tap anywhere on screen ${returnTapCount || '5'} times within ${returnTapTimeout ? `${(parseInt(returnTapTimeout, 10) / 1000).toFixed(1)}s` : '1.5s'} to access settings`}
            {kioskEnabled && ' (PIN required)'}
          </Text>
        </SettingsInfoBox>
      </SettingsSection>
      
      {/* Touch Blocking Overlays - Works without Device Owner but less secure */}
      <SettingsSection title="Touch Blocking" icon="gesture-tap-button">
        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            ℹ️ Block touch input on specific screen areas (e.g., navigation bars, toolbars) to prevent users from interacting with certain parts of {displayMode === 'webview' ? 'the website' : 'external apps'}.
          </Text>
        </SettingsInfoBox>
        
        {(!kioskEnabled || !isDeviceOwner) && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              ⚠️ Without Lock Mode + Device Owner, users can still exit the app via Home/Back buttons. For maximum security, enable both.
            </Text>
          </SettingsInfoBox>
        )}
        
        <SettingsButton
          title="Configure Blocking Overlays"
          icon="rectangle-outline"
          variant="primary"
          onPress={() => navigation?.navigate('BlockingOverlays')}
        />
        
        {kioskEnabled && isDeviceOwner && (
          <SettingsInfoBox variant="success">
            <Text style={styles.infoText}>
              ✅ Lock Mode + Device Owner active. Maximum security enabled.
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>
      
      {/* URL Filtering - Blacklist/Whitelist (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title="URL Filtering" icon="shield-lock">
          <SettingsSwitch
            label="Enable URL Filtering"
            hint="Control which URLs can be accessed in the kiosk browser"
            value={urlFilterEnabled}
            onValueChange={onUrlFilterEnabledChange}
          />
          
          {urlFilterEnabled && (
            <>
              <View style={styles.divider} />
              
              <SettingsModeSelector
                label="Filter Mode"
                options={[
                  {
                    value: 'blacklist',
                    label: 'Blacklist',
                    icon: 'close-circle',
                  },
                  {
                    value: 'whitelist',
                    label: 'Whitelist',
                    icon: 'check-circle-outline',
                  },
                ]}
                value={urlFilterMode}
                onValueChange={onUrlFilterModeChange}
                hint={urlFilterMode === 'blacklist' 
                  ? 'URLs matching these patterns will be blocked. The main kiosk URL is always allowed, even if it matches a pattern.' 
                  : 'Only the main kiosk URL and URLs matching these patterns will be allowed. With an empty list, only your kiosk URL can be accessed.'}
              />
              
              <View style={styles.divider} />
              
              <UrlListEditor
                urls={urlFilterList}
                onUrlsChange={onUrlFilterListChange}
                maxUrls={0}
                patternMode={true}
                placeholder={urlFilterMode === 'blacklist' ? '*facebook.com*' : '*mysite.com/*'}
                emptyTitle="No patterns added yet"
                emptyHint={urlFilterMode === 'blacklist' 
                  ? 'Add URL patterns to block' 
                  : 'Only your main kiosk URL is currently allowed. Add patterns to allow more URLs.'}
              />
              
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {'ℹ️ Use * as wildcard to match any characters.\n\n'}
                  {'Examples:\n'}
                  {'• *facebook.com* → matches any URL containing facebook.com\n'}
                  {'• */privacy* → matches any path containing /privacy\n'}
                  {'• https://example.com/admin/* → matches all admin pages'}
                </Text>
              </SettingsInfoBox>
              
              <SettingsInfoBox variant="success">
                <Text style={styles.infoText}>
                  {'✅ The main kiosk URL configured in General settings is always allowed, even if it matches a blacklist pattern. You don\'t need to add it to the whitelist.'}
                </Text>
              </SettingsInfoBox>
              
              <View style={styles.divider} />
              
              <SettingsSwitch
                label="Show Blocked Notification"
                hint="Briefly display a toast message when a URL is blocked"
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
          <SettingsSection title="External App Behavior" icon="application">
            <SettingsSwitch
              label="🔄 Auto-Relaunch App"
              hint="Automatically relaunch the app if it closes or crashes"
              value={autoRelaunchApp}
              onValueChange={onAutoRelaunchAppChange}
            />
          </SettingsSection>
          
          {/* Back Button Behavior */}
          <SettingsSection title="Back Button Behavior" icon="undo">
            <SettingsRadioGroup
              hint="Action when the Android Back button is pressed"
              options={[
                {
                  value: 'test',
                  label: 'Test Mode',
                  icon: 'test-tube',
                  hint: 'Back button works normally (for testing)',
                },
                {
                  value: 'immediate',
                  label: 'Immediate Return',
                  icon: 'flash',
                  hint: 'Relaunch app instantly',
                },
                {
                  value: 'timer',
                  label: 'Delayed Return',
                  icon: 'timer',
                  hint: 'Wait X seconds then relaunch app automatically',
                },
              ]}
              value={backButtonMode}
              onValueChange={onBackButtonModeChange}
            />
            
            {backButtonMode === 'timer' && (
              <View style={styles.timerInput}>
                <SettingsInput
                  label="Delay (1-3600 seconds)"
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
      
      {/* Return Mechanism Info - Always visible */}
      <SettingsSection variant="info">
        <Text style={styles.infoTitle}>ℹ️ Return to Settings</Text>
        <Text style={styles.infoText}>
          {displayMode === 'external_app' && returnMode === 'button'
            ? `• Tap the return button (${returnButtonPosition}) ${returnTapCount || '5'} times${overlayButtonVisible ? '' : ' (invisible)'}`
            : `• Tap ${returnTapCount || '5'} times anywhere on the screen within ${returnTapTimeout ? `${(parseInt(returnTapTimeout, 10) / 1000).toFixed(1)}s` : '1.5s'}${overlayButtonVisible ? ' (visual indicator visible)' : ''}`}
          {displayMode === 'external_app' && '\n• Or use the recent apps selector'}
          {displayMode === 'webview' && volumeUp5TapEnabled && `\n• Or press Volume Up/Down ${returnTapCount || '5'} times rapidly`}
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
