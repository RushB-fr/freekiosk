/**
 * Certificates trusted in advance, by SHA-256 fingerprint (Settings > Advanced, WebView mode).
 *
 * The warning dialog asks once per certificate and only on the page itself, which does not work
 * for a tablet nobody is in front of, nor for a host that is only reached as a sub-resource.
 * Here the person lists the fingerprints they expect. The WebView client trusts a certificate
 * only when its fingerprint is in the list; nothing here accepts "any" certificate.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SettingsButton, SettingsInput, SettingsSection } from './settings';
import Icon from './Icon';
import CertificateModule, { TrustedFingerprint } from '../utils/CertificateModule';
import { formatFingerprint, normalizeFingerprint } from '../utils/certificateFingerprint';
import { Colors, Spacing, Typography } from '../theme';

export const TrustedCertificatesSection: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<TrustedFingerprint[]>([]);
  const [fingerprint, setFingerprint] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await CertificateModule.getTrustedFingerprints());
    } catch {
      // The list stays as it was.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const normalized = normalizeFingerprint(fingerprint);
    if (normalized === null) {
      setError(t('advanced.trustedCertificates.invalid'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await CertificateModule.addTrustedFingerprint(normalized, label.trim());
      setFingerprint('');
      setLabel('');
      await load();
    } catch {
      setError(t('advanced.trustedCertificates.invalid'));
    } finally {
      setBusy(false);
    }
  };

  const remove = (item: TrustedFingerprint) => {
    Alert.alert(
      t('advanced.trustedCertificates.removeTitle'),
      t('advanced.trustedCertificates.removeMessage'),
      [
        { text: t('screens.settingsMain.cancel'), style: 'cancel' },
        {
          text: t('screens.settingsMain.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await CertificateModule.removeTrustedFingerprint(item.fingerprint);
              await load();
            } catch (e) {
              Alert.alert(t('screens.settingsMain.error'), t('screens.settingsMain.failedMessage', { error: String(e) }));
            }
          },
        },
      ],
    );
  };

  return (
    <SettingsSection title={t('advanced.trustedCertificates.title')} icon="shield-check">
      <Text style={styles.hint}>{t('advanced.trustedCertificates.hint')}</Text>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t('advanced.trustedCertificates.empty')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.fingerprint} style={styles.item}>
              <View style={styles.itemInfo}>
                {item.label ? (
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                ) : null}
                <Text style={styles.itemFingerprint} numberOfLines={2}>
                  {formatFingerprint(item.fingerprint)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => remove(item)}
                accessibilityRole="button"
                accessibilityLabel={t('screens.settingsMain.remove')}
              >
                <Icon name="delete-outline" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <SettingsInput
        label={t('advanced.trustedCertificates.fingerprintLabel')}
        hint={t('advanced.trustedCertificates.fingerprintHint')}
        value={fingerprint}
        onChangeText={(text) => {
          setFingerprint(text);
          if (error) setError(undefined);
        }}
        placeholder={t('advanced.trustedCertificates.fingerprintPlaceholder')}
        autoCapitalize="characters"
        error={error}
        multiline
      />
      <SettingsInput
        label={t('advanced.trustedCertificates.labelLabel')}
        value={label}
        onChangeText={setLabel}
        placeholder={t('advanced.trustedCertificates.labelPlaceholder')}
        maxLength={80}
      />
      <SettingsButton
        title={t('advanced.trustedCertificates.add')}
        icon="shield-check"
        onPress={add}
        variant="primary"
        disabled={busy || fingerprint.trim() === ''}
      />
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
  hint: {
    ...Typography.hint,
    marginBottom: Spacing.md,
  },
  emptyState: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  emptyStateText: {
    ...Typography.hint,
  },
  list: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    padding: Spacing.md,
    borderRadius: Spacing.inputRadius,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  itemInfo: {
    flex: 1,
  },
  itemLabel: {
    ...Typography.label,
    fontSize: 14,
    marginBottom: 4,
  },
  itemFingerprint: {
    ...Typography.mono,
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
});

export default TrustedCertificatesSection;
