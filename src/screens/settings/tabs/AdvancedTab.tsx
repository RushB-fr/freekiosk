/**
 * FreeKiosk v1.2 - Advanced Tab
 * SSL Certificates, Updates, Reset, Device Owner, REST API
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  SettingsSection,
  SettingsButton,
  SettingsInfoBox,
} from '../../../components/settings';
import { ApiSettingsSection } from '../../../components/ApiSettingsSection';
import { CertificateInfo } from '../../../utils/CertificateModule';
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
}) => {
  return (
    <View>
      {/* App Updates - Only for Device Owners */}
      {isDeviceOwner && (
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
            Device Owner mode: Manual updates via GitHub.
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
  versionFooter: {
    ...Typography.hint,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
});

export default AdvancedTab;
