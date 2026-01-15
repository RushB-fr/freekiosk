/**
 * FreeKiosk v1.2 - SettingsSection Component
 * A card-style container for grouping related settings
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface SettingsSectionProps {
  title?: string;
  icon?: IconName;
  children: React.ReactNode;
  variant?: 'default' | 'info' | 'warning' | 'error' | 'success';
  style?: ViewStyle;
  noPadding?: boolean;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  icon,
  children,
  variant = 'default',
  style,
  noPadding = false,
}) => {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'info': return Colors.cardInfo;
      case 'warning': return Colors.cardWarning;
      case 'error': return Colors.cardError;
      case 'success': return Colors.cardSuccess;
      default: return Colors.cardDefault;
    }
  };

  const getBorderColor = () => {
    switch (variant) {
      case 'info': return Colors.info;
      case 'warning': return Colors.warning;
      case 'error': return Colors.error;
      case 'success': return Colors.success;
      default: return 'transparent';
    }
  };

  const getTitleColor = () => {
    switch (variant) {
      case 'info': return Colors.infoDark;
      case 'warning': return Colors.warningDark;
      case 'error': return Colors.errorDark;
      case 'success': return Colors.successDark;
      default: return Colors.textPrimary;
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: getBackgroundColor() },
        variant !== 'default' && { borderLeftWidth: 4, borderLeftColor: getBorderColor() },
        noPadding && { padding: 0 },
        style,
      ]}
    >
      {title && (
        <View style={styles.header}>
          {icon && <Icon name={icon} size={20} color={getTitleColor()} style={styles.icon} />}
          <Text style={[styles.title, { color: getTitleColor() }]}>{title}</Text>
        </View>
      )}
      <View style={noPadding ? undefined : styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Spacing.cardRadius,
    padding: Spacing.cardPadding,
    marginBottom: Spacing.sectionMargin,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  title: {
    ...Typography.label,
    flex: 1,
  },
  content: {
    // Content wrapper if needed
  },
});

export default SettingsSection;
