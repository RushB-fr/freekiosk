/**
 * FreeKiosk v1.2 - SettingsInfoBox Component
 * Informational boxes with different variants
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';

interface SettingsInfoBoxProps {
  title?: string;
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'error' | 'success';
  style?: ViewStyle;
}

const SettingsInfoBox: React.FC<SettingsInfoBoxProps> = ({
  title,
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
      {title && <Text style={[styles.title, { color: colors.title }]}>{title}</Text>}
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
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
  },
  text: {
    ...Typography.body,
    lineHeight: 22,
  },
});

export default SettingsInfoBox;
