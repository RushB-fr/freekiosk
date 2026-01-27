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
  
  // Return to Settings
  returnTapCount: string;
  onReturnTapCountChange: (value: string) => void;
  volumeUp5TapEnabled: boolean;
  onVolumeUp5TapEnabledChange: (value: boolean) => void;
  overlayButtonVisible: boolean;
  onOverlayButtonVisibleChange: (value: boolean) => void;
  
  // Auto launch
  autoLaunchEnabled: boolean;
  onAutoLaunchChange: (value: boolean) => void;
  
  // External app specific
  autoRelaunchApp: boolean;
  onAutoRelaunchAppChange: (value: boolean) => void;
  backButtonMode: string;
  onBackButtonModeChange: (value: string) => void;
  backButtonTimerDelay: string;
  onBackButtonTimerDelayChange: (value: string) => void;
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  displayMode,
  isDeviceOwner,
  navigation,
  kioskEnabled,
  onKioskEnabledChange,
  allowPowerButton,
  onAllowPowerButtonChange,
  returnTapCount,
  onReturnTapCountChange,
  volumeUp5TapEnabled,
  onVolumeUp5TapEnabledChange,
  overlayButtonVisible,
  onOverlayButtonVisibleChange,
  autoLaunchEnabled,
  onAutoLaunchChange,
  autoRelaunchApp,
  onAutoRelaunchAppChange,
  backButtonMode,
  onBackButtonModeChange,
  backButtonTimerDelay,
  onBackButtonTimerDelayChange,
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
              label="🔌 Allow Power Button"
              hint="Allow access to power menu to shut down or restart device. When disabled, power button only turns screen on/off."
              value={allowPowerButton}
              onValueChange={onAllowPowerButtonChange}
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
          onPress={() => Linking.openSettings()}
        />
      </SettingsSection>
      
      {/* Return to Settings */}
      <SettingsSection title="Return to Settings" icon="gesture-tap">
        <SettingsInput
          label="Number of Screen Taps (2-10)"
          hint="Tap anywhere on screen this many times rapidly to access settings"
          value={returnTapCount}
          onChangeText={(text) => {
            const filtered = text.replace(/[^0-9]/g, '');
            onReturnTapCountChange(filtered);
          }}
          keyboardType="numeric"
          placeholder="5"
          maxLength={2}
          error={returnTapCount !== '' && (parseInt(returnTapCount, 10) < 2 || parseInt(returnTapCount, 10) > 10) ? 'Must be between 2 and 10' : undefined}
        />
        
        <SettingsSwitch
          label="👁️ Show Visual Indicator"
          hint="Display a small visual indicator (bottom-right). Taps work anywhere regardless of this setting."
          value={overlayButtonVisible}
          onValueChange={onOverlayButtonVisibleChange}
        />
        
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
            ℹ️ Tap anywhere on screen {returnTapCount || '5'} times rapidly to access settings{kioskEnabled && ' (PIN required)'}
          </Text>
        </SettingsInfoBox>
      </SettingsSection>
      
      {/* Touch Blocking Overlays - Requires Lock Mode + Device Owner for security */}
      <SettingsSection title="Touch Blocking" icon="gesture-tap-button">
        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            ℹ️ Block touch input on specific screen areas (e.g., navigation bars, toolbars) to prevent users from interacting with certain parts of {displayMode === 'webview' ? 'the website' : 'external apps'}.
          </Text>
        </SettingsInfoBox>
        
        {(!kioskEnabled || !isDeviceOwner) && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              ⚠️ Requires Lock Mode enabled AND Device Owner privileges for security reasons. Blocking overlays will only be active when both conditions are met.
            </Text>
          </SettingsInfoBox>
        )}
        
        <SettingsButton
          title="Configure Blocking Overlays"
          icon="rectangle-outline"
          variant={kioskEnabled && isDeviceOwner ? "primary" : "secondary"}
          onPress={() => navigation?.navigate('BlockingOverlays')}
        />
        
        {kioskEnabled && isDeviceOwner && (
          <SettingsInfoBox variant="success">
            <Text style={styles.infoText}>
              ✅ Lock Mode + Device Owner active. Blocking overlays will work.
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>
      
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
          • Tap {returnTapCount || '5'} times anywhere on the screen {overlayButtonVisible && '(visual indicator in bottom-right)'}
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
