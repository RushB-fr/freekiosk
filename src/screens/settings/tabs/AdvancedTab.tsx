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
  SettingsInput,
  BackupRestoreSection,
} from '../../../components/settings';
import { ApiSettingsSection } from '../../../components/ApiSettingsSection';
import { MqttSettingsSection } from '../../../components/MqttSettingsSection';
import { CertificateInfo } from '../../../utils/CertificateModule';
import AccessibilityModule from '../../../utils/AccessibilityModule';
import { CloudSyncService } from '../../../utils/CloudSyncService';
import { CLOUD_ENABLED } from '../../../config/features';
import QrScannerModal from '../../../components/QrScannerModal';
import PermissionWizard from '../../../components/PermissionWizard';
import Icon from '../../../components/Icon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { Colors, Spacing, Typography } from '../../../theme';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [accessibilityRunning, setAccessibilityRunning] = useState(false);

  // Cloud management state
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState('https://cloud.freekiosk.app');
  const [enrollToken, setEnrollToken] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  // When true, closing the wizard finishes enrollment by returning to the kiosk.
  const [wizardAfterEnroll, setWizardAfterEnroll] = useState(false);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAccessibilityStatus();
      }
    });
    return () => subscription.remove();
  }, [checkAccessibilityStatus]);

  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    CloudSyncService.getCredentials().then(creds => {
      if (creds) {
        setIsEnrolled(true);
        setOrgName(creds.organizationName ?? null);
      } else {
        setIsEnrolled(false);
        setOrgName(null);
      }
    });
  }, []);

  const handleEnroll = () => {
    if (!cloudUrl.trim() || !enrollToken.trim()) {
      Alert.alert(t('advanced.cloud.missingFieldsTitle'), t('advanced.cloud.missingFieldsMessage'));
      return;
    }
    Alert.alert(
      t('advanced.cloud.enrollConfirmTitle'),
      t('advanced.cloud.enrollConfirmMessage'),
      [
        { text: t('advanced.cloud.cancel'), style: 'cancel' },
        {
          text: t('advanced.cloud.enroll'),
          style: 'destructive',
          onPress: async () => {
            setEnrolling(true);
            const PC = NativeModules.PlatformConstants as any;
            const result = await CloudSyncService.enroll(cloudUrl.trim(), enrollToken.trim(), {
              model: PC?.Model ?? '',
              manufacturer: PC?.Manufacturer ?? '',
              android_version: PC?.Release ?? '',
              app_version: PC?.appVersion ?? '',
              serial_number: '',
            });
            setEnrolling(false);
            if (result.success) {
              setIsEnrolled(true);
              setOrgName(result.organizationName ?? null);
              setCloudUrl('');
              setEnrollToken('');
              // Guide the user through permissions before returning to the kiosk.
              // Closing the wizard triggers the navigation reset (see onClose).
              setWizardAfterEnroll(true);
              setShowWizard(true);
            } else {
              Alert.alert(t('advanced.cloud.enrollmentFailedTitle'), result.error ?? t('advanced.cloud.unknownError'));
            }
          },
        },
      ],
    );
  };

  // Fill the enrollment fields from a scanned QR. The cloud dashboard encodes the bare
  // token; we also tolerate a structured payload (JSON {url,token} or "url|token") so a
  // future richer QR can fill the server URL too.
  const handleScanned = (raw: string) => {
    setShowScanner(false);
    const data = raw.trim();
    let url: string | undefined;
    let token = data;
    try {
      const obj = JSON.parse(data);
      if (obj && (obj.token || obj.url)) {
        url = typeof obj.url === 'string' ? obj.url : undefined;
        token = obj.token != null ? String(obj.token) : '';
      }
    } catch {
      if (data.includes('|')) {
        const [u, t] = data.split('|');
        url = u;
        token = t;
      }
    }
    if (url) setCloudUrl(url);
    if (token) setEnrollToken(token);
  };

  const handleUnenroll = () => {
    Alert.alert(
      t('advanced.cloud.leaveConfirmTitle'),
      t('advanced.cloud.leaveConfirmMessage'),
      [
        { text: t('advanced.cloud.cancel'), style: 'cancel' },
        {
          text: t('advanced.cloud.unenroll'),
          style: 'destructive',
          onPress: async () => {
            setUnenrolling(true);
            await CloudSyncService.unenroll();
            setUnenrolling(false);
            setIsEnrolled(false);
            setOrgName(null);
          },
        },
      ],
    );
  };

  const handleOpenAccessibilitySettings = async () => {
    try {
      // Use KioskModule.openAndroidSettings which properly handles Lock Task Mode
      // (temporarily exits lock task before launching the settings intent)
      await KioskModule.openAndroidSettings('accessibility');
    } catch {
      Alert.alert(t('advanced.accessibility.errorTitle'), t('advanced.accessibility.errorOpenSettings'));
    }
  };

  const handleEnableViaDeviceOwner = async () => {
    try {
      await AccessibilityModule.enableViaDeviceOwner();
      // Re-check status after enabling
      setTimeout(checkAccessibilityStatus, 1000);
      Alert.alert(t('advanced.accessibility.successTitle'), t('advanced.accessibility.successEnabled'));
    } catch (e: any) {
      if (e.code === 'WRITE_SECURE_SETTINGS_REQUIRED') {
        Alert.alert(
          t('advanced.accessibility.permissionRequiredTitle'),
          t('advanced.accessibility.permissionRequiredMessage'),
          [{ text: 'OK' }],
        );
      } else {
        Alert.alert(t('advanced.accessibility.errorTitle'), e.message || t('advanced.accessibility.failedEnable'));
      }
    }
  };
  return (
    <View>
      {/* Cloud Management */}
      {CLOUD_ENABLED && <SettingsSection title={t('advanced.cloud.title')} icon="sync">
        {isEnrolled ? (
          <>
            <SettingsInfoBox variant="success" icon="cloud-check" title={t('advanced.cloud.enrolledTitle')}>
              <Text style={styles.infoText}>
                {t('advanced.cloud.enrolledInfo', { org: orgName ? t('advanced.cloud.enrolledInOrg', { org: orgName }) : '' })}
              </Text>
            </SettingsInfoBox>
            <SettingsButton
              title={t('advanced.cloud.setupPermissions')}
              icon="shield-check"
              variant="secondary"
              onPress={() => { setWizardAfterEnroll(false); setShowWizard(true); }}
            />
            <SettingsButton
              title={unenrolling ? t('advanced.cloud.unenrolling') : t('advanced.cloud.leaveCloud')}
              icon="alert-circle"
              variant="danger"
              onPress={handleUnenroll}
              disabled={unenrolling}
              loading={unenrolling}
            />
          </>
        ) : (
          <>
            <SettingsInfoBox variant="info" title={t('advanced.cloud.zeroTouchTitle')}>
              <Text style={styles.infoText}>
                {t('advanced.cloud.zeroTouchInfo')}
              </Text>
            </SettingsInfoBox>
            <SettingsInput
              label={t('advanced.cloud.cloudUrl')}
              icon="server"
              placeholder="https://cloud.freekiosk.app"
              value={cloudUrl}
              onChangeText={setCloudUrl}
              keyboardType="url"
            />
            <SettingsInput
              label={t('advanced.cloud.enrollmentToken')}
              icon="key"
              placeholder="A1B2C3"
              value={enrollToken}
              onChangeText={setEnrollToken}
            />
            <SettingsButton
              title={t('advanced.cloud.scanQr')}
              icon="camera"
              variant="secondary"
              onPress={() => setShowScanner(true)}
            />
            <SettingsButton
              title={enrolling ? t('advanced.cloud.enrolling') : t('advanced.cloud.enrollDevice')}
              icon="upload"
              variant="primary"
              onPress={handleEnroll}
              disabled={enrolling}
              loading={enrolling}
            />
            <QrScannerModal
              visible={showScanner}
              onClose={() => setShowScanner(false)}
              onScanned={handleScanned}
            />
          </>
        )}
      </SettingsSection>}

      <PermissionWizard
        visible={showWizard}
        onClose={() => {
          setShowWizard(false);
          if (wizardAfterEnroll) {
            setWizardAfterEnroll(false);
            // Settings were wiped to defaults at enrollment; return to the base
            // KioskScreen with a fresh mount so the reset config takes effect.
            navigation.reset({ index: 0, routes: [{ name: 'Kiosk' }] });
          }
        }}
      />

      {/* App Updates - Hidden in Play Store builds (compliance: no in-app updates) */}
      {enableSelfUpdate && (
      <SettingsSection title={t('advanced.updates.title')} icon="update">
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>{t('advanced.updates.currentVersion')}</Text>
          <Text style={styles.versionValue}>{currentVersion}</Text>
        </View>

        {updateAvailable && updateInfo && (
          <SettingsInfoBox variant="success" icon="party-popper" title={`${updateInfo.isPrerelease ? t('advanced.updates.betaPrefix') : ''}${t('advanced.updates.updateAvailable')}`}>
            <Text style={styles.infoText}>
              {t('advanced.updates.versionAvailable', { version: updateInfo.version, prerelease: updateInfo.isPrerelease ? t('advanced.updates.prereleaseSuffix') : '' })}
              {updateInfo.notes && `\n\n${updateInfo.notes.substring(0, 150)}...`}
            </Text>
          </SettingsInfoBox>
        )}

        <View style={styles.betaRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.betaLabel}>{t('advanced.updates.betaUpdates')}</Text>
            <Text style={styles.betaHint}>{t('advanced.updates.betaUpdatesHint')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.betaToggle, betaUpdatesEnabled && styles.betaToggleActive]}
            onPress={() => onBetaUpdatesChange(!betaUpdatesEnabled)}
          >
            <Text style={[styles.betaToggleText, betaUpdatesEnabled && styles.betaToggleTextActive]}>
              {betaUpdatesEnabled ? t('advanced.updates.on') : t('advanced.updates.off')}
            </Text>
          </TouchableOpacity>
        </View>

        <SettingsButton
          title={checkingUpdate ? t('advanced.updates.checking') : downloading ? t('advanced.updates.downloading') : t('advanced.updates.checkForUpdates')}
          icon={checkingUpdate ? 'timer-sand' : downloading ? 'download' : 'magnify'}
          variant="primary"
          onPress={onCheckForUpdates}
          disabled={checkingUpdate || downloading}
          loading={checkingUpdate}
        />

        {updateAvailable && updateInfo && (
          <SettingsButton
            title={downloading ? t('advanced.updates.downloading') : t('advanced.updates.downloadInstall')}
            icon="download"
            variant="success"
            onPress={onDownloadUpdate}
            disabled={downloading}
            loading={downloading}
          />
        )}

        <Text style={styles.hint}>
          {isDeviceOwner ? t('advanced.updates.hintOwner') : t('advanced.updates.hintNonOwner')}
        </Text>
      </SettingsSection>
      )}

      {/* SSL Certificates - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('advanced.certificates.title')} icon="certificate-outline">
          <Text style={styles.hint}>
            {t('advanced.certificates.hint')}
          </Text>

          {certificates.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{t('advanced.certificates.empty')}</Text>
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
                      {cert.isExpired ? t('advanced.certificates.expired') : t('advanced.certificates.expires')}
                      {cert.expiryDate}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => onRemoveCertificate(cert.fingerprint, cert.url)}
                  >
                    <Icon name="delete-outline" size={22} color={Colors.error} />
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
      <SettingsSection title={t('advanced.accessibility.title')} icon="keyboard-outline">
        <View style={styles.accessibilityStatusRow}>
          <Text style={styles.accessibilityStatusLabel}>{t('advanced.accessibility.status')}</Text>
          <View style={[
            styles.accessibilityStatusBadge,
            { backgroundColor: accessibilityRunning ? Colors.successLight : accessibilityEnabled ? Colors.warningLight : Colors.errorLight },
          ]}>
            <Text style={[
              styles.accessibilityStatusText,
              { color: accessibilityRunning ? Colors.successDark : accessibilityEnabled ? Colors.warningDark : Colors.errorDark },
            ]}>
              {accessibilityRunning ? t('advanced.accessibility.active') : accessibilityEnabled ? t('advanced.accessibility.enabledNotConnected') : t('advanced.accessibility.disabled')}
            </Text>
          </View>
        </View>

        <SettingsInfoBox variant="info" icon="help-circle" title={t('advanced.accessibility.whyTitle')}>
          <Text style={styles.infoText}>
            {t('advanced.accessibility.whyInfo')}
          </Text>
        </SettingsInfoBox>

        {!accessibilityRunning && (
          <>
            {isDeviceOwner ? (
              <SettingsButton
                title={t('advanced.accessibility.enableAuto')}
                icon="shield-check"
                variant="primary"
                onPress={handleEnableViaDeviceOwner}
              />
            ) : null}
            <SettingsButton
              title={t('advanced.accessibility.openSettings')}
              icon="open-in-new"
              variant="primary"
              onPress={handleOpenAccessibilitySettings}
            />
            <Text style={styles.hint}>
              {isDeviceOwner
                ? t('advanced.accessibility.hintOwner')
                : t('advanced.accessibility.hintNonOwner')}
            </Text>
          </>
        )}

        {accessibilityRunning && (
          <Text style={styles.hint}>
            {t('advanced.accessibility.runningHint')}
          </Text>
        )}

        {isDeviceOwner && displayMode === 'external_app' && (
          <SettingsInfoBox variant="info" icon="cog-outline" title={t('advanced.accessibility.managedAppsTitle')}>
            <Text style={styles.infoText}>
              {t('advanced.accessibility.managedAppsInfo')}
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>
      )}

      {/* Backup & Restore */}
      <BackupRestoreSection onRestoreComplete={onRestoreComplete} />

      {/* Android System Settings */}
      <SettingsSection title={t('advanced.androidSettings.title')} icon="android">
        <Text style={styles.hint}>
          {t('advanced.androidSettings.hint')}
        </Text>
        {kioskEnabled && (
          <SettingsInfoBox variant="info" icon="lock" title={t('advanced.androidSettings.kioskActiveTitle')}>
            <Text style={styles.infoText}>
              {t('advanced.androidSettings.kioskActiveInfo')}
            </Text>
          </SettingsInfoBox>
        )}
        <SettingsButton
          title={t('advanced.androidSettings.openSettings')}
          icon="cog"
          variant="primary"
          onPress={() => KioskModule.openAndroidSettings(null)}
        />
        <View style={styles.settingsShortcuts}>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('wifi')}
          >
            <Icon name="wifi" size={22} color={Colors.primary} style={styles.shortcutIcon} />
            <Text style={styles.shortcutText}>{t('advanced.androidSettings.wifi')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('sound')}
          >
            <Icon name="volume-high" size={22} color={Colors.primary} style={styles.shortcutIcon} />
            <Text style={styles.shortcutText}>{t('advanced.androidSettings.sound')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('display')}
          >
            <Icon name="brightness-6" size={22} color={Colors.primary} style={styles.shortcutIcon} />
            <Text style={styles.shortcutText}>{t('advanced.androidSettings.display')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('bluetooth')}
          >
            <Icon name="bluetooth" size={22} color={Colors.primary} style={styles.shortcutIcon} />
            <Text style={styles.shortcutText}>{t('advanced.androidSettings.bluetooth')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('date')}
          >
            <Icon name="calendar-clock" size={22} color={Colors.primary} style={styles.shortcutIcon} />
            <Text style={styles.shortcutText}>{t('advanced.androidSettings.dateTime')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shortcutButton}
            onPress={() => KioskModule.openAndroidSettings('apps')}
          >
            <Icon name="apps" size={22} color={Colors.primary} style={styles.shortcutIcon} />
            <Text style={styles.shortcutText}>{t('advanced.androidSettings.apps')}</Text>
          </TouchableOpacity>
        </View>
      </SettingsSection>

      {/* Actions */}
      <SettingsSection title={t('advanced.actions.title')} icon="cog-outline">
        <SettingsButton
          title={t('advanced.actions.resetSettings')}
          icon="restart"
          variant="warning"
          onPress={onResetSettings}
        />

        {isDeviceOwner && (
          <SettingsButton
            title={t('advanced.actions.removeDeviceOwner')}
            icon="alert"
            variant="danger"
            onPress={onRemoveDeviceOwner}
          />
        )}

        {kioskEnabled && (
          <SettingsButton
            title={t('advanced.actions.exitKioskMode')}
            icon="exit-to-app"
            variant="danger"
            onPress={onExitKioskMode}
          />
        )}
      </SettingsSection>

      {/* Version footer */}
      <Text style={styles.versionFooter}>
        {t('advanced.versionFooter', { version: currentVersion })}
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
  shortcutIcon: {
    marginBottom: 4,
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
