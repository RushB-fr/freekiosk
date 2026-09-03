/**
 * FreeKiosk v1.2 - SettingsInfoBox Component
 * Informational boxes with different variants
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface SettingsInfoBoxProps {
  title?: string;
  icon?: IconName;
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'error' | 'success';
  style?: ViewStyle;
}

const DEFAULT_ICONS: Record<string, IconName> = {
  info: 'information',
  warning: 'alert',
  error: 'alert-circle',
  success: 'check-circle',
};

const SettingsInfoBox: React.FC<SettingsInfoBoxProps> = ({
  title,
  icon,
  children,
  variant = 'info',
  style,
}) => {
  const getColors = () => {
    switch (variant) {
      case 'warning':
        return {
          background: Colors.warningLight,
          border: Colors.warning,
          title: Colors.warningDark,
          text: '#856404',
        };
      case 'error':
        return {
          background: Colors.errorLight,
          border: Colors.error,
          title: Colors.errorDark,
          text: Colors.errorDark,
        };
      case 'success':
        return {
          background: Colors.successLight,
          border: Colors.success,
          title: Colors.successDark,
          text: Colors.successDark,
        };
      default:
        return {
          background: Colors.infoLight,
          border: Colors.info,
          title: Colors.infoDark,
          text: Colors.textSecondary,
        };
    }
  };

  const colors = getColors();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderLeftColor: colors.border,
        },
        style,
      ]}
    >
      {title && (
        <View style={styles.titleRow}>
          <Icon name={icon ?? DEFAULT_ICONS[variant]} size={18} color={colors.title} style={styles.titleIcon} />
          <Text style={[styles.title, { color: colors.title }]}>{title}</Text>
        </View>
      )}
      {typeof children === 'string' ? (
        <Text style={[styles.text, { color: colors.text }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.cardPadding,
    borderRadius: Spacing.inputRadius,
    borderLeftWidth: 4,
    marginTop: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  titleIcon: {
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  text: {
    ...Typography.body,
    lineHeight: 22,
  },
});

export default SettingsInfoBox;
