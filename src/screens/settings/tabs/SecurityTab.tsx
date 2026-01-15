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
  
  // Lock mode
  kioskEnabled: boolean;
  onKioskEnabledChange: (value: boolean) => void;
  
  // Power button
  allowPowerButton: boolean;
  onAllowPowerButtonChange: (value: boolean) => void;
  
  // Auto launch
  autoLaunchEnabled: boolean;
  onAutoLaunchChange: (value: boolean) => void;
  
  // External app specific
  autoRelaunchApp: boolean;
  onAutoRelaunchAppChange: (value: boolean) => void;
  overlayButtonVisible: boolean;
  onOverlayButtonVisibleChange: (value: boolean) => void;
  overlayButtonPosition: string;
  onOverlayButtonPositionChange: (value: string) => void;
  backButtonMode: string;
  onBackButtonModeChange: (value: string) => void;
  backButtonTimerDelay: string;
  onBackButtonTimerDelayChange: (value: string) => void;
}

const SecurityTab: React.FC<SecurityTabProps> = ({
  displayMode,
  isDeviceOwner,
  kioskEnabled,
  onKioskEnabledChange,
  allowPowerButton,
  onAllowPowerButtonChange,
  autoLaunchEnabled,
  onAutoLaunchChange,
  autoRelaunchApp,
  onAutoRelaunchAppChange,
  overlayButtonVisible,
  onOverlayButtonVisibleChange,
  overlayButtonPosition,
  onOverlayButtonPositionChange,
  backButtonMode,
  onBackButtonModeChange,
  backButtonTimerDelay,
  onBackButtonTimerDelayChange,
}) => {
  // Helper to get position label for info text
  const getPositionLabel = (position: string) => {
    switch (position) {
      case 'top-left': return 'top-left corner';
      case 'top-right': return 'top-right corner';
      case 'bottom-left': return 'bottom-left corner';
      default: return 'bottom-right corner';
    }
  };

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
              ℹ️ Lock Mode enabled: Only overlay 5-tap + PIN code allows exit from external app
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
        
        <SettingsInfoBox variant="warning">
          <Text style={styles.infoText}>
            ⚠️ For non-Device Owner devices, enable "Display over other apps" permission in system settings.
          </Text>
        </SettingsInfoBox>
        
        <SettingsButton
          title="Open System Settings"
          icon="cog-outline"
          variant="primary"
          onPress={() => Linking.openSettings()}
        />
      </SettingsSection>
      
      {/* Return Button Settings - Available for both modes */}
      <SettingsSection title="Return Button" icon="gesture-tap">
        <SettingsSwitch
          label="👁️ Show Return Button"
          hint={displayMode === 'webview' 
            ? "Make the return button visible on screen (otherwise tap the invisible area)"
            : "Make the return button visible over the external app (otherwise tap the invisible area)"
          }
          value={overlayButtonVisible}
          onValueChange={onOverlayButtonVisibleChange}
        />
        
        <View style={styles.divider} />
        
        <SettingsRadioGroup
          label="📍 Return Button Position"
          hint="Position of the return button on screen. Change this if it blocks your app's or website's buttons."
          options={[
            {
              value: 'bottom-right',
              label: 'Bottom Right',
              icon: 'chevron-down',
              hint: 'Default position',
            },
            {
              value: 'bottom-left',
              label: 'Bottom Left',
              icon: 'chevron-down',
              hint: 'Bottom left corner',
            },
            {
              value: 'top-right',
              label: 'Top Right',
              icon: 'chevron-up',
              hint: 'Top right corner',
            },
            {
              value: 'top-left',
              label: 'Top Left',
              icon: 'chevron-up',
              hint: 'Top left corner',
            },
          ]}
          value={overlayButtonPosition}
          onValueChange={onOverlayButtonPositionChange}
        />
        
        <SettingsInfoBox variant="info">
          <Text style={styles.infoText}>
            ℹ️ Tap the return button 5 times to access settings (PIN required if Lock Mode is enabled)
          </Text>
        </SettingsInfoBox>
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
          • Tap 5 times on the {overlayButtonVisible ? 'blue button' : 'invisible area'} in the {getPositionLabel(overlayButtonPosition)}{'\n'}
          {displayMode === 'external_app' && '• Or use the recent apps selector\n'}
          • Device Owner mode: Press Volume Up button 5 times rapidly
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
