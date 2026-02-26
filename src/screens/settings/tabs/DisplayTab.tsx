/**
 * FreeKiosk v1.2 - Display Tab
 * Brightness, Status Bar, Keyboard settings
 */

import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import {
  SettingsSection,
  SettingsSwitch,
  SettingsSlider,
  SettingsRadioGroup,
  SettingsInfoBox,
  SettingsInput,
} from '../../../components/settings';
import ScreenScheduleRuleCard from '../../../components/settings/ScreenScheduleRuleCard';
import { Colors, Spacing, Typography } from '../../../theme';
import { ScreenScheduleRule } from '../../../types/screenScheduler';

interface DisplayTabProps {
  displayMode: 'webview' | 'external_app';
  
  // Brightness management (allow system to manage)
  brightnessManagementEnabled: boolean;
  onBrightnessManagementEnabledChange: (value: boolean) => void;
  
  // Default brightness
  defaultBrightness: number;
  onDefaultBrightnessChange: (value: number) => void;
  
  // Auto-brightness
  autoBrightnessEnabled: boolean;
  onAutoBrightnessEnabledChange: (value: boolean) => void;
  autoBrightnessMin: number;
  onAutoBrightnessMinChange: (value: number) => void;
  autoBrightnessMax: number;
  onAutoBrightnessMaxChange: (value: number) => void;
  currentLightLevel: number;
  hasLightSensor: boolean;
  
  // Status bar
  statusBarEnabled: boolean;
  onStatusBarEnabledChange: (value: boolean) => void;
  statusBarOnOverlay: boolean;
  onStatusBarOnOverlayChange: (value: boolean) => void;
  statusBarOnReturn: boolean;
  onStatusBarOnReturnChange: (value: boolean) => void;
  
  // Status bar items
  showBattery: boolean;
  onShowBatteryChange: (value: boolean) => void;
  showWifi: boolean;
  onShowWifiChange: (value: boolean) => void;
  showBluetooth: boolean;
  onShowBluetoothChange: (value: boolean) => void;
  showVolume: boolean;
  onShowVolumeChange: (value: boolean) => void;
  showTime: boolean;
  onShowTimeChange: (value: boolean) => void;
  
  // Keyboard mode
  keyboardMode: string;
  onKeyboardModeChange: (value: string) => void;
  
  // Screensaver
  screensaverEnabled: boolean;
  onScreensaverEnabledChange: (value: boolean) => void;
  screensaverBrightness: number;
  onScreensaverBrightnessChange: (value: number) => void;
  inactivityDelay: string;
  onInactivityDelayChange: (value: string) => void;
  
  // Motion detection
  motionEnabled: boolean;
  onMotionEnabledChange: (value: boolean) => void;
  motionCameraPosition: 'front' | 'back';
  onMotionCameraPositionChange: (value: 'front' | 'back') => void;
  availableCameras: Array<{position: 'front' | 'back', id: string}>;
  
  // Screen Sleep Scheduler
  screenSchedulerEnabled: boolean;
  onScreenSchedulerEnabledChange: (value: boolean) => void;
  screenSchedulerRules: ScreenScheduleRule[];
  onScreenSchedulerRulesChange: (rules: ScreenScheduleRule[]) => void;
  screenSchedulerWakeOnTouch: boolean;
  onScreenSchedulerWakeOnTouchChange: (value: boolean) => void;
  onAddScheduleRule: () => void;
  onEditScheduleRule: (rule: ScreenScheduleRule) => void;
}

const DisplayTab: React.FC<DisplayTabProps> = ({
  displayMode,
  brightnessManagementEnabled,
  onBrightnessManagementEnabledChange,
  defaultBrightness,
  onDefaultBrightnessChange,
  autoBrightnessEnabled,
  onAutoBrightnessEnabledChange,
  autoBrightnessMin,
  onAutoBrightnessMinChange,
  autoBrightnessMax,
  onAutoBrightnessMaxChange,
  currentLightLevel,
  hasLightSensor,
  statusBarEnabled,
  onStatusBarEnabledChange,
  statusBarOnOverlay,
  onStatusBarOnOverlayChange,
  statusBarOnReturn,
  onStatusBarOnReturnChange,
  showBattery,
  onShowBatteryChange,
  showWifi,
  onShowWifiChange,
  showBluetooth,
  onShowBluetoothChange,
  showVolume,
  onShowVolumeChange,
  showTime,
  onShowTimeChange,
  keyboardMode,
  onKeyboardModeChange,
  screensaverEnabled,
  onScreensaverEnabledChange,
  screensaverBrightness,
  onScreensaverBrightnessChange,
  inactivityDelay,
  onInactivityDelayChange,
  motionEnabled,
  onMotionEnabledChange,
  motionCameraPosition,
  onMotionCameraPositionChange,
  availableCameras,
  screenSchedulerEnabled,
  onScreenSchedulerEnabledChange,
  screenSchedulerRules,
  onScreenSchedulerRulesChange,
  screenSchedulerWakeOnTouch,
  onScreenSchedulerWakeOnTouchChange,
  onAddScheduleRule,
  onEditScheduleRule,
}) => {
  const handleCameraPositionChange = (value: string) => {
    if (value === 'front' || value === 'back') {
      onMotionCameraPositionChange(value);
    }
  };

  // Générer les options de caméra en fonction des caméras disponibles (dédupliquées par position)
  const uniquePositions = Array.from(new Set(availableCameras.map(cam => cam.position)));
  const cameraOptions = uniquePositions.map(position => ({
    label: position === 'front' ? 'Front Camera' : 'Back Camera',
    value: position,
  }));

  // Vérifier si la caméra sélectionnée est disponible
  const selectedCameraAvailable = availableCameras.some(cam => cam.position === motionCameraPosition);

  return (
    <View>
      {/* App Brightness Control toggle - WebView mode only (external app mode doesn't manage brightness) */}
      {displayMode === 'webview' && (
        <SettingsSection title="Brightness Control" icon="brightness-6">
          <SettingsSwitch
            label="App Brightness Control"
            hint={brightnessManagementEnabled
              ? "FreeKiosk manages screen brightness"
              : "System manages brightness (Tasker, Android settings, etc.)"}
            value={brightnessManagementEnabled}
            onValueChange={onBrightnessManagementEnabledChange}
          />
          {!brightnessManagementEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                💡 Brightness is managed by the system. External tools like Tasker can control brightness without interference from FreeKiosk.
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}

      {/* Default Brightness - Only in WebView mode and when app manages brightness */}
      {displayMode === 'webview' && brightnessManagementEnabled && (
        <SettingsSection title="Manual Brightness" icon="brightness-6">
          <SettingsSlider
            label=""
            hint={autoBrightnessEnabled 
              ? "Disabled while auto-brightness is active" 
              : "Screen brightness level (0% - 100%)"}
            value={defaultBrightness}
            onValueChange={onDefaultBrightnessChange}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            disabled={autoBrightnessEnabled}
          />
          {autoBrightnessEnabled && (
            <SettingsInfoBox variant="warning">
              <Text style={styles.infoText}>
                ⚠️ Manual brightness control is disabled while auto-brightness is active
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}
      
      {/* Auto-Brightness - WebView only, and only when app manages brightness */}
      {displayMode === 'webview' && brightnessManagementEnabled && (
        <SettingsSection title="Auto-Brightness" icon="brightness-auto">
          <SettingsSwitch
            label="Enable Auto-Brightness"
            hint="Automatically adjust screen brightness based on ambient light"
            value={autoBrightnessEnabled}
            onValueChange={onAutoBrightnessEnabledChange}
            disabled={!hasLightSensor}
          />
          
          {!hasLightSensor && (
            <SettingsInfoBox variant="error">
              <Text style={styles.infoText}>
                ⚠️ Light sensor not available on this device
              </Text>
            </SettingsInfoBox>
          )}
          
          {hasLightSensor && autoBrightnessEnabled && (
            <>
              <SettingsSlider
                label="Minimum Brightness"
                hint="Lowest brightness in dark conditions"
                value={autoBrightnessMin}
                onValueChange={onAutoBrightnessMinChange}
                minimumValue={0}
                maximumValue={1}
                step={0.05}
                presets={[
                  { label: '5%', value: 0.05 },
                  { label: '10%', value: 0.1 },
                  { label: '20%', value: 0.2 },
                ]}
              />
              
              <SettingsSlider
                label="Maximum Brightness"
                hint="Highest brightness in bright conditions"
                value={autoBrightnessMax}
                onValueChange={onAutoBrightnessMaxChange}
                minimumValue={0}
                maximumValue={1}
                step={0.05}
                presets={[
                  { label: '80%', value: 0.8 },
                  { label: '90%', value: 0.9 },
                  { label: '100%', value: 1.0 },
                ]}
              />
              
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  💡 Current Light Level: {currentLightLevel.toFixed(1)} lux
                </Text>
              </SettingsInfoBox>
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Screensaver - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Screensaver" icon="weather-night">
          <SettingsSwitch
            label="Enable Screensaver"
            hint="Activate screensaver after a period of inactivity"
            value={screensaverEnabled}
            onValueChange={onScreensaverEnabledChange}
          />
          
          {screensaverEnabled && (
            <>
              {/* Screensaver Brightness - only when app manages brightness */}
              {brightnessManagementEnabled && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>Screensaver Brightness</Text>
                  <SettingsSlider
                    label=""
                    hint="Screen brightness when screensaver is active"
                    value={screensaverBrightness}
                    onValueChange={onScreensaverBrightnessChange}
                    minimumValue={0}
                    maximumValue={1}
                    step={0.01}
                    presets={[
                      { label: 'Black Screen', value: 0 },
                      { label: 'Very Dim (5%)', value: 0.05 },
                      { label: 'Dim (10%)', value: 0.1 },
                    ]}
                  />
                </View>
              )}
              
              {/* Inactivity Delay */}
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>Inactivity Delay</Text>
                <SettingsInput
                  label=""
                  value={inactivityDelay}
                  onChangeText={(text) => {
                    if (/^\d*$/.test(text)) {
                      onInactivityDelayChange(text);
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={3}
                  placeholder="10"
                  hint="Time in minutes before screensaver activates"
                />
              </View>
              
              {/* Motion Detection */}
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>Motion Detection</Text>
                <SettingsSwitch
                  label="Enable Detection"
                  hint="Wake screen when motion is detected by the camera"
                  value={motionEnabled}
                  onValueChange={onMotionEnabledChange}
                />
                
                {motionEnabled && (
                  <>
                    {availableCameras.length === 0 && (
                      <SettingsInfoBox variant="error">
                        <Text style={styles.infoText}>
                          ⚠️ No camera detected on this device
                        </Text>
                      </SettingsInfoBox>
                    )}
                    
                    {availableCameras.length === 1 && (
                      <SettingsInfoBox variant="info">
                        <Text style={styles.infoText}>
                          📹 Using {availableCameras[0].position === 'front' ? 'Front' : 'Back'} Camera (only camera available)
                        </Text>
                      </SettingsInfoBox>
                    )}
                    
                    {availableCameras.length > 1 && (
                      <>
                        <SettingsRadioGroup
                          label="Camera Position"
                          hint="Select which camera to use for motion detection"
                          options={cameraOptions}
                          value={motionCameraPosition}
                          onValueChange={handleCameraPositionChange}
                        />
                        
                        {!selectedCameraAvailable && (
                          <SettingsInfoBox variant="warning">
                            <Text style={styles.infoText}>
                              ⚠️ Selected camera not available on this device
                            </Text>
                          </SettingsInfoBox>
                        )}
                      </>
                    )}

                  </>
                )}
              </View>
              
              {/* How it works */}
              <View style={styles.subSection}>
                <Text style={styles.infoTitle}>ℹ️ How It Works</Text>
                <Text style={styles.infoText}>
                  • After {inactivityDelay || '10'} minute(s) without interaction, the screen dims{`
`}
                  • Touch the screen to wake the device{`
`}
                  {motionEnabled && `• Motion in front of the camera also wakes the screen
`}
                  • Normal brightness is restored automatically
                </Text>
              </View>
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Screen Sleep Scheduler */}
      <SettingsSection title="Screen Sleep Schedule" icon="power-sleep">
        <SettingsSwitch
          label="Enable Screen Schedule"
          hint="Automatically turn screen off/on at scheduled times to save energy"
          value={screenSchedulerEnabled}
          onValueChange={onScreenSchedulerEnabledChange}
        />
        
        {screenSchedulerEnabled && (
          <>
            {/* Schedule Rules List */}
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Schedule Rules</Text>
              {screenSchedulerRules.length === 0 ? (
                <SettingsInfoBox variant="info">
                  <Text style={styles.infoText}>
                    No rules configured yet. Add a rule to define when the screen should turn off.
                  </Text>
                </SettingsInfoBox>
              ) : (
                <View style={styles.rulesContainer}>
                  {screenSchedulerRules.map((rule) => (
                    <ScreenScheduleRuleCard
                      key={rule.id}
                      rule={rule}
                      onToggle={(id, enabled) => {
                        onScreenSchedulerRulesChange(
                          screenSchedulerRules.map(r =>
                            r.id === id ? { ...r, enabled } : r
                          )
                        );
                      }}
                      onEdit={onEditScheduleRule}
                      onDelete={(id) => {
                        Alert.alert(
                          'Delete Rule',
                          'Are you sure you want to delete this schedule rule?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => {
                                onScreenSchedulerRulesChange(
                                  screenSchedulerRules.filter(r => r.id !== id)
                                );
                              },
                            },
                          ]
                        );
                      }}
                    />
                  ))}
                </View>
              )}
              
              <TouchableOpacity style={styles.addRuleButton} onPress={onAddScheduleRule}>
                <Text style={styles.addRuleButtonText}>➕ Add Schedule Rule</Text>
              </TouchableOpacity>
            </View>
            
            {/* Wake on Touch option */}
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Wake Options</Text>
              <SettingsSwitch
                label="Wake on Touch"
                hint="Allow the screen to wake up temporarily when touched during a scheduled sleep period"
                value={screenSchedulerWakeOnTouch}
                onValueChange={onScreenSchedulerWakeOnTouchChange}
              />
              {!screenSchedulerWakeOnTouch && (
                <SettingsInfoBox variant="warning">
                  <Text style={styles.infoText}>
                    ⚠️ Touch will not wake the screen during sleep periods. Use the scheduled wake time or REST API to turn screen back on.
                  </Text>
                </SettingsInfoBox>
              )}
            </View>
            
            {/* How it works */}
            <View style={styles.subSection}>
              <Text style={styles.infoTitle}>ℹ️ How Screen Schedule Works</Text>
              <Text style={styles.infoText}>
                • Screen turns OFF automatically at the scheduled sleep time{`\n`}
                • Screen turns ON automatically at the scheduled wake time{`\n`}
                • Multiple rules can cover different days/times{`\n`}
                • Overnight rules (e.g., 22:00→07:00) are supported{`\n`}
                {screenSchedulerWakeOnTouch
                  ? '• Touch the screen to temporarily wake it during sleep\n'
                  : '• Touch wake is disabled during sleep periods\n'
                }
                {`\n`}
                {'📱 Device Owner: screen is truly locked (lockNow) + native alarm for wake\n'}
                {'📱 Non Device Owner: brightness set to 0 + black overlay\n'}
                {'⏰ Wake alarm uses Android AlarmManager for reliable timing'}
              </Text>
            </View>
          </>
        )}
      </SettingsSection>
      
      {/* Status Bar */}
      <SettingsSection title="System Status Bar" icon="chart-bar">
        <SettingsSwitch
          label="Show Status Bar"
          hint="Display battery, Wi-Fi, Bluetooth, volume and time at the top of the screen"
          value={statusBarEnabled}
          onValueChange={onStatusBarEnabledChange}
        />
        
        {statusBarEnabled && (
          <View style={styles.subSection}>
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                📐 Layout: Items positioned left and right to avoid center camera area
              </Text>
            </SettingsInfoBox>
            
            {/* Customize Status Bar Items */}
            <Text style={styles.subSectionTitle}>🎨 Customize Items</Text>
            
            <View style={styles.itemsGrid}>
              <SettingsSwitch
                label="🔋 Battery"
                value={showBattery}
                onValueChange={onShowBatteryChange}
              />
              
              <SettingsSwitch
                label="📶 Wi-Fi"
                value={showWifi}
                onValueChange={onShowWifiChange}
              />
              
              <SettingsSwitch
                label="📘 Bluetooth"
                value={showBluetooth}
                onValueChange={onShowBluetoothChange}
              />
              
              <SettingsSwitch
                label="🔊 Volume"
                value={showVolume}
                onValueChange={onShowVolumeChange}
              />
              
              <SettingsSwitch
                label="🕐 Time"
                value={showTime}
                onValueChange={onShowTimeChange}
              />
            </View>
            
            {/* External App specific options */}
            {displayMode === 'external_app' && (
              <View style={styles.externalAppOptions}>
                <Text style={styles.subSectionTitle}>📱 External App Mode Options</Text>
                
                <SettingsSwitch
                  label="On External App (Overlay)"
                  hint="Show status bar overlay on top of the external app"
                  value={statusBarOnOverlay}
                  onValueChange={onStatusBarOnOverlayChange}
                />
                
                <SettingsSwitch
                  label="On Return Screen"
                  hint="Show status bar on the 'External App Running' screen"
                  value={statusBarOnReturn}
                  onValueChange={onStatusBarOnReturnChange}
                />
              </View>
            )}
            
            {displayMode === 'webview' && (
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  WebView mode: Status bar appears above the web content
                </Text>
              </SettingsInfoBox>
            )}
          </View>
        )}
      </SettingsSection>
      
      {/* Keyboard Mode - Only in WebView mode */}
      {displayMode === 'webview' && (
        <SettingsSection title="Keyboard Mode" icon="keyboard-outline">
          <SettingsRadioGroup
            hint="Control which keyboard appears for input fields"
            options={[
              {
                value: 'default',
                label: 'Default',
                hint: 'Respect website settings (recommended)',
              },
              {
                value: 'force_numeric',
                label: 'Force Numeric',
                hint: 'All fields show numeric keyboard',
              },
              {
                value: 'smart',
                label: 'Smart Detection',
                hint: 'Detect and convert numeric fields only',
              },
            ]}
            value={keyboardMode}
            onValueChange={onKeyboardModeChange}
          />
        </SettingsSection>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  subSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  subSectionTitle: {
    ...Typography.labelSmall,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  itemsGrid: {
    gap: Spacing.xs,
  },
  externalAppOptions: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  infoText: {
    ...Typography.body,
    color: Colors.infoDark,
  },
  infoTitle: {
    ...Typography.label,
    color: Colors.infoDark,
    marginBottom: Spacing.sm,
  },
  rulesContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  addRuleButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  addRuleButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default DisplayTab;
