/**
 * FreeKiosk v1.2 - SettingsButton Component
 * Styled buttons for actions
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, ActivityIndicator, View } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon, { IconName } from '../Icon';

interface SettingsButtonProps {
  title: string;
  icon?: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({
  title,
  icon,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  fullWidth = true,
}) => {
  const getBackgroundColor = () => {
    if (disabled) return Colors.textDisabled;
    switch (variant) {
      case 'primary': return Colors.primary;
      case 'secondary': return Colors.textSecondary;
      case 'success': return Colors.success;
      case 'warning': return Colors.warning;
      case 'danger': return Colors.error;
      case 'outline': return 'transparent';
      default: return Colors.primary;
    }
  };

  const getBorderColor = () => {
    if (disabled) return Colors.textDisabled;
    switch (variant) {
      case 'outline': return Colors.border;
      case 'primary': return Colors.primaryDark;
      case 'success': return Colors.successDark;
      case 'warning': return Colors.warningDark;
      case 'danger': return Colors.errorDark;
      default: return getBackgroundColor();
    }
  };

  const getTextColor = () => {
    if (variant === 'outline') {
      return disabled ? Colors.textDisabled : Colors.textSecondary;
    }
    return Colors.textOnPrimary;
  };

  const getPadding = () => {
    switch (size) {
      case 'small': return { paddingVertical: 8, paddingHorizontal: 12 };
      case 'large': return { paddingVertical: 18, paddingHorizontal: 24 };
      default: return { paddingVertical: 15, paddingHorizontal: 20 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return 14;
      case 'large': return 20;
      default: return 18;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          ...getPadding(),
        },
        fullWidth && styles.fullWidth,
        variant !== 'outline' && styles.shadow,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && <Icon name={icon} size={getFontSize()} color={getTextColor()} style={styles.icon} />}
          <Text style={[styles.text, { color: getTextColor(), fontSize: getFontSize() }]}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: Spacing.buttonRadius,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  shadow: {
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default SettingsButton;
