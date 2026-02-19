/**
 * FreeKiosk v1.2 - Advanced Tab
 * SSL Certificates, Updates, Reset, Device Owner, REST API
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
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

interface AdvancedTabProps {
  displayMode: 'webview' | 'external_app';
  isDeviceOwner: boolean;
  
  // Version & updates
  currentVersion: string;
  checkingUpdate: boolean;
  downloading: boolean;
  updateAvailable: boolean;
  updateInfo: any;
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
  currentVersion,
  checkingUpdate,
  downloading,
  updateAvailable,
  updateInfo,
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
      await AccessibilityModule.openAccessibilitySettings();
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
      Alert.alert('Error', e.message || 'Failed to enable via Device Owner');
    }
  };
  return (
    <View>
      {/* App Updates - Available for all users */}
      <SettingsSection title="Updates" icon="update">
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>Current Version</Text>
          <Text style={styles.versionValue}>{currentVersion}</Text>
        </View>
        
        {updateAvailable && updateInfo && (
          <SettingsInfoBox variant="success" title="🎉 Update Available">
            <Text style={styles.infoText}>
              Version {updateInfo.version} is available!
              {updateInfo.notes && `\n\n${updateInfo.notes.substring(0, 150)}...`}
            </Text>
          </SettingsInfoBox>
        )}
        
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

      {/* Accessibility Service - Required for keyboard injection in External App mode */}
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
                ? 'Device Owner mode can enable the service automatically, or you can enable it manually in Android settings.'
                : 'Enable "FreeKiosk" in Settings → Accessibility → Installed Services.'}
            </Text>
          </>
        )}

        {accessibilityRunning && (
          <Text style={styles.hint}>
            ✅ Keyboard emulation is available for all apps (WebView + External Apps).
          </Text>
        )}
      </SettingsSection>

      {/* Backup & Restore */}
      <BackupRestoreSection onRestoreComplete={onRestoreComplete} />

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
  versionFooter: {
    ...Typography.hint,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
});

export default AdvancedTab;
