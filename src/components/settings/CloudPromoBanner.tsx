/**
 * Banner under the Settings header that points an un-enrolled tablet to FreeKiosk Cloud.
 *
 * Shown only while the tablet is not enrolled and the banner has not been closed. Closing it
 * is final: this is an open-source app, and a message that keeps coming back is noise.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing } from '../../theme';
import Icon from '../Icon';
import { CLOUD_ENABLED } from '../../config/features';
import { CloudSyncService } from '../../utils/CloudSyncService';
import { StorageService } from '../../utils/storage';

interface CloudPromoBannerProps {
  onConnect: () => void;
  /** Changes whenever the enrolment state may have changed (e.g. the active tab). */
  refreshKey?: string;
}

const CloudPromoBanner: React.FC<CloudPromoBannerProps> = ({ onConnect, refreshKey }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    let cancelled = false;
    Promise.all([CloudSyncService.isEnrolled(), StorageService.isCloudPromoDismissed()])
      .then(([enrolled, dismissed]) => {
        if (!cancelled) setVisible(!enrolled && !dismissed);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!visible) return null;

  const handleDismiss = (): void => {
    setVisible(false);
    StorageService.dismissCloudPromo();
  };

  return (
    <View style={styles.container} testID="cloud-promo-banner">
      <Icon name="cloud-cog" size={22} color={Colors.primary} />
      <View style={styles.textBlock}>
        <Text style={styles.title}>{t('components.cloudPromo.title')}</Text>
        <Text style={styles.body}>{t('components.cloudPromo.body')}</Text>
      </View>
      <TouchableOpacity style={styles.connectButton} onPress={onConnect} activeOpacity={0.8}>
        <Text style={styles.connectText}>{t('components.cloudPromo.connect')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={t('components.cloudPromo.dismiss')}
        testID="cloud-promo-dismiss"
      >
        <Icon name="close" size={20} color={Colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  textBlock: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  body: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  connectButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.md,
  },
  connectText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default CloudPromoBanner;
