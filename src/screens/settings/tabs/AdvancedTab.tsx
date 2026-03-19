/**
 * FreeKiosk v1.2 - Advanced Tab
 * SSL Certificates, Updates, Reset, Device Owner, REST API
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState, NativeModules } from 'react-native';
import {
  SettingsSection,
  SettingsButton,
  SettingsInfoBox,
  BackupRestoreSection,
} from '../../../components/settings';
import { ApiSettingsSection } from '../../../components/ApiSettingsSection';
import { MqttSettingsSection } from '../../../components/MqttSettingsSection';
import { CertificateInfo } from '../../../utils/CertificateModule';
import AccessibilityModule from '../../../utils/AccessibilityModule';
import { Colors, Spacing, Typography } from '../../../theme';

const { KioskModule } = NativeModules;

interface AdvancedTabProps {
  displayMode: 'webview' | 'external_app' | 'media_player';
  isDeviceOwner: boolean;
  
  // Play Store compliance: when false, the entire Updates section is hidden
  enableSelfUpdate: boolean;
  
  // Version & updates
  currentVersion: string;
  checkingUpdate: boolean;
  downloading: boolean;
  updateAvailable: boolean;
  updateInfo: any;
  betaUpdatesEnabled: boolean;
  onBetaUpdatesChange: (value: boolean) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  
  // SSL Certificates
  certificates: CertificateInfo[];
  onRemoveCertificate: (fingerprint: string, url: string) => void;
  
  // Actions
  onResetSettings: () => void;
  onExitKioskMode: () => void;
  onRemoveDeviceOwner: () => void;
  kioskEnabled: boolean;
  
  // Backup/Restore
  onRestoreComplete?: () => void;
}

const AdvancedTab: React.FC<AdvancedTabProps> = ({
  displayMode,
  isDeviceOwner,
  enableSelfUpdate,
  currentVersion,
  checkingUpdate,
  downloading,
  updateAvailable,
  updateInfo,
  betaUpdatesEnabled,
  onBetaUpdatesChange,
  onCheckForUpdates,
  onDownloadUpdate,
  certificates,
  onRemoveCertificate,
  onResetSettings,
  onExitKioskMode,
  onRemoveDeviceOwner,
  kioskEnabled,
  onRestoreComplete,
}) => {
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [accessibilityRunning, setAccessibilityRunning] = useState(false);

  const checkAccessibilityStatus = useCallback(async () => {
    try {
      const enabled = await AccessibilityModule.isAccessibilityServiceEnabled();
      const running = await AccessibilityModule.isAccessibilityServiceRunning();
      setAccessibilityEnabled(enabled);
      setAccessibilityRunning(running);
    } catch {
      // Ignore errors on iOS
    }
  }, []);

  useEffect(() => {
    checkAccessibilityStatus();
    // Re-check when the app returns from system settings
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAccessibilityStatus();
      }
    });
    return () => subscription.remove();
  }, [checkAccessibilityStatus]);

  const handleOpenAccessibilitySettings = async () => {
    try {
      // Use KioskModule.openAndroidSettings which properly handles Lock Task Mode
      // (temporarily exits lock task before launching the settings intent)
      await KioskModule.openAndroidSettings('accessibility');
    } catch (e: any) {
      Alert.alert('Error', 'Could not open Accessibility Settings');
    }
  };

  const handleEnableViaDeviceOwner = async () => {
    try {
      await AccessibilityModule.enableViaDeviceOwner();
      // Re-check status after enabling
      setTimeout(checkAccessibilityStatus, 1000);
      Alert.alert('Success', 'Accessibility Service has been enabled automatically via Device Owner.');
    } catch (e: any) {
      if (e.code === 'WRITE_SECURE_SETTINGS_REQUIRED') {
        Alert.alert(
          'Permission Required',
          'To auto-enable the Accessibility Service, the WRITE_SECURE_SETTINGS permission must be granted via ADB (one-time setup):\n\n' +
          'adb shell pm grant com.freekiosk android.permission.WRITE_SECURE_SETTINGS\n\n' +
          'Alternatively, tap "Open Accessibility Settings" below to enable it manually.',
          [{ text: 'OK' }],
        );
      } else {
        Alert.alert('Error', e.message || 'Failed to enable via Device Owner');
      }
    }
  };
  return (
    <View>
      {/* App Updates - Hidden in Play Store builds (compliance: no in-app updates) */}
      {enableSelfUpdate && (
      <SettingsSection title="Updates" icon="update">
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Current Version</Text>
          <Text style={styles.versionValue}>{currentVersion}</Text>
        </View>
        
        {updateAvailable && updateInfo && (
          <SettingsInfoBox variant="success" title={`🎉 ${updateInfo.isPrerelease ? '🧪 Beta ' : ''}Update Available`}>
            <Text style={styles.infoText}>
              Version {updateInfo.version} is available!{updateInfo.isPrerelease ? ' (pre-release)' : ''}
              {updateInfo.notes && `\n\n${updateInfo.notes.substring(0, 150)}...`}
            </Text>
          </SettingsInfoBox>
        )}
        
        <View style={styles.betaRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.betaLabel}>🧪 Beta Updates</Text>
            <Text style={styles.betaHint}>Receive pre-release versions before stable</Text>
          </View>
          <TouchableOpacity
            style={[styles.betaToggle, betaUpdatesEnabled && styles.betaToggleActive]}
            onPress={() => onBetaUpdatesChange(!betaUpdatesEnabled)}
          >
            <Text style={[styles.betaToggleText, betaUpdatesEnabled && styles.betaToggleTextActive]}>
              {betaUpdatesEnabled ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <SettingsButton
          title={checkingUpdate ? 'Checking...' : downloading ? 'Downloading...' : 'Check for Updates'}
          icon={checkingUpdate ? 'timer-sand' : downloading ? 'download' : 'magnify'}
          variant="primary"
          onPress={onCheckForUpdates}
          disabled={checkingUpdate || downloading}
          loading={checkingUpdate}
        />
        
        {updateAvailable && updateInfo && (
          <SettingsButton
            title={downloading ? 'Downloading...' : 'Download & Install'}
            icon="download"
            variant="success"
            onPress={onDownloadUpdate}
            disabled={downloading}
            loading={downloading}
          />
        )}
        
        <Text style={styles.hint}>
          {isDeviceOwner ? 'Device Owner mode: Manual updates via GitHub.' : 'Download and install updates from GitHub.'}
        </Text>
      </SettingsSection>
      )}
      
      {/* SSL Certificates - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Accepted SSL Certificates" icon="certificate-outline">
          <Text style={styles.hint}>
            Self-signed certificates you've accepted. They expire after 1 year.
          </Text>
          
          {certificates.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No certificates accepted</Text>
            </View>
          ) : (
            <View style={styles.certificatesList}>
              {certificates.map((cert) => (
                <View key={cert.fingerprint} style={styles.certificateItem}>
                  <View style={styles.certificateInfo}>
                    <Text style={styles.certificateUrl} numberOfLines={1}>
                      {cert.url}
                    </Text>
                    <Text style={styles.certificateFingerprint} numberOfLines={1}>
                      {cert.fingerprint.substring(0, 24)}...
                    </Text>
                    <Text style={[styles.certificateExpiry, cert.isExpired && styles.certificateExpired]}>
                      {cert.isExpired ? '⚠️ Expired: ' : 'Expires: '}
                      {cert.expiryDate}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => onRemoveCertificate(cert.fingerprint, cert.url)}
                  >
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </SettingsSection>
      )}
      
      {/* REST API - Home Assistant Integration */}
      <ApiSettingsSection />

      {/* MQTT - Home Assistant Integration */}
      <MqttSettingsSection />

      {/* Accessibility Service - Hidden in Play Store builds (BIND_ACCESSIBILITY_SERVICE policy) */}
      {enableSelfUpdate && (
      <SettingsSection title="Accessibility Service" icon="keyboard-outline">
        <View style={styles.accessibilityStatusRow}>
          <Text style={styles.accessibilityStatusLabel}>Status</Text>
          <View style={[
            styles.accessibilityStatusBadge,
            { backgroundColor: accessibilityRunning ? Colors.successLight : accessibilityEnabled ? Colors.warningLight : Colors.errorLight },
          ]}>
            <Text style={[
              styles.accessibilityStatusText,
              { color: accessibilityRunning ? Colors.successDark : accessibilityEnabled ? Colors.warningDark : Colors.errorDark },
            ]}>
              {accessibilityRunning ? '● Active' : accessibilityEnabled ? '● Enabled (not connected)' : '○ Disabled'}
            </Text>
          </View>
        </View>

        <SettingsInfoBox variant="info" title="ℹ️ Why is this needed?">
          <Text style={styles.infoText}>
            The Accessibility Service allows FreeKiosk to send keyboard input (remote control, text input) to external apps.{'\n\n'}
            Without it, keyboard emulation only works inside FreeKiosk's own WebView.
          </Text>
        </SettingsInfoBox>

        {!accessibilityRunning && (
          <>
            {isDeviceOwner ? (
              <SettingsButton
                title="Enable Automatically (Device Owner)"
                icon="shield-check"
                variant="primary"
                onPress={handleEnableViaDeviceOwner}
              />
            ) : null}
            <SettingsButton
              title="Open Accessibility Settings"
              icon="open-in-new"
              variant="primary"
              onPress={handleOpenAccessibilitySettings}
            />
            <Text style={styles.hint}>
              {isDeviceOwner
                ? 'Device Owner mode can enable the service automatically if the WRITE_SECURE_SETTINGS permission has been granted via ADB. Otherwise, enable it manually in Android settings.'
                : 'Enable "FreeKiosk" in Settings → Accessibility → Installed Services.'}
            </Text>
          </>
        )}

        {accessibilityRunning && (
          <Text style={styles.hint}>
            ✅ Keyboard emulation is available for all apps (WebView + External Apps).
          </Text>
        )}

        {isDeviceOwner && displayMode === 'external_app' && (
          <SettingsInfoBox variant="info" title="🔧 Managed Apps Accessibility">
            <Text style={styles.infoText}>
              You can allow other apps' accessibility services in the "Managed Apps" section of the General tab.{'\n'}
              Toggle "Allow Accessibility" per app to whitelist their accessibility services via Device Owner.
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>
      )}

      {/* Backup & Restore */}
      <BackupRestoreSection onRestoreComplete={onRestoreComplete} />

      {/* Android System Settings */}
      <SettingsSection title="Android System Settings" icon="android">
        <Text style={styles.hint}>
          Open native Android settings to change WiFi, volume, display and more.
          Useful when your device has no physical navigation buttons.
        </Text>
        {kioskEnabled && (
          <SettingsInfoBox variant="info" title="🔒 Kiosk Mode Active">
            <Text style={styles.infoText}>
              Kiosk mode will be temporarily paused to open Android settings.{' '}
              It will automatically re-engage when you return to FreeKiosk.
            </Text>
          </SettingsInfoBox>
        )}
        <SettingsButton
          title="Open Android Settings"
          icon="cog"
          variant="primary"
          onPress={() => KioskModule.openAndroidSettings(null)}
        />
        <View style={styles.settingsShortcuts}>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('wifi')}
          >
            <Text style={styles.shortcutText}>📶 WiFi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('sound')}
          >
            <Text style={styles.shortcutText}>🔊 Sound</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('display')}
          >
            <Text style={styles.shortcutText}>🔆 Display</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('bluetooth')}
          >
            <Text style={styles.shortcutText}>📡 Bluetooth</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('date')}
          >
            <Text style={styles.shortcutText}>📅 Date & Time</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('apps')}
          >
            <Text style={styles.shortcutText}>📱 Apps</Text>
          </TouchableOpacity>
        </View>
      </SettingsSection>

      {/* Actions */}
      <SettingsSection title="Actions" icon="cog-outline">
        <SettingsButton
          title="Reset All Settings"
          icon="restart"
          variant="warning"
          onPress={onResetSettings}
        />
        
        {isDeviceOwner && (
          <SettingsButton
            title="Remove Device Owner"
            icon="alert"
            variant="danger"
            onPress={onRemoveDeviceOwner}
          />
        )}
        
        {kioskEnabled && (
          <SettingsButton
            title="Exit Kiosk Mode"
            icon="exit-to-app"
            variant="danger"
            onPress={onExitKioskMode}
          />
        )}
      </SettingsSection>
      
      {/* Version footer */}
      <Text style={styles.versionFooter}>
        FreeKiosk v{currentVersion}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  versionLabel: {
    ...Typography.body,
  },
  versionValue: {
    ...Typography.label,
    color: Colors.primary,
  },
  hint: {
    ...Typography.hint,
    marginTop: Spacing.sm,
  },
  infoTitle: {
    ...Typography.label,
    color: Colors.infoDark,
    marginBottom: Spacing.sm,
  },
  infoText: {
    ...Typography.body,
    lineHeight: 22,
  },
  emptyState: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: Spacing.inputRadius,
    marginTop: Spacing.md,
  },
  emptyStateText: {
    ...Typography.body,
    fontStyle: 'italic',
    color: Colors.textHint,
  },
  certificatesList: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  certificateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    padding: Spacing.md,
    borderRadius: Spacing.inputRadius,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  certificateInfo: {
    flex: 1,
  },
  certificateUrl: {
    ...Typography.label,
    fontSize: 14,
    marginBottom: 4,
  },
  certificateFingerprint: {
    ...Typography.mono,
    marginBottom: 4,
  },
  certificateExpiry: {
    ...Typography.hint,
    color: Colors.primary,
  },
  certificateExpired: {
    color: Colors.error,
    fontWeight: '600',
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  deleteButtonText: {
    fontSize: 24,
  },
  accessibilityStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  accessibilityStatusLabel: {
    ...Typography.body,
    fontWeight: '600',
  },
  accessibilityStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 12,
  },
  accessibilityStatusText: {
    ...Typography.label,
    fontSize: 13,
  },
  settingsShortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  shortcutButton: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Spacing.inputRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceVariant,
  },
  shortcutText: {
    ...Typography.label,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  versionFooter: {
    ...Typography.hint,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  betaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  betaLabel: {
    ...Typography.label,
    fontSize: 14,
  },
  betaHint: {
    ...Typography.hint,
    fontSize: 12,
    marginTop: 2,
  },
  betaToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  betaToggleActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  betaToggleText: {
    ...Typography.label,
    fontSize: 12,
    color: Colors.textHint,
  },
  betaToggleTextActive: {
    color: '#2E7D32',
  },
});

export default AdvancedTab;
