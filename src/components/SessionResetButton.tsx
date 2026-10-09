/**
 * FreeKiosk - SessionResetButton (#156)
 *
 * Small bottom-left overlay button for shared tablets. A tap asks for confirmation, then
 * calls onConfirm(), which wipes the web session and returns to the start URL. The
 * confirmation matters: this is a kiosk in front of the public, and a stray touch must not
 * log anyone out.
 */
import React from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface SessionResetButtonProps {
  /** Called once the user has confirmed. */
  onConfirm: () => void;
}

const SIZE = 50;

const SessionResetButton: React.FC<SessionResetButtonProps> = ({ onConfirm }) => {
  const { t } = useTranslation();

  const handlePress = (): void => {
    Alert.alert(t('components.sessionReset.title'), t('components.sessionReset.message'), [
      { text: t('components.sessionReset.cancel'), style: 'cancel' },
      { text: t('components.sessionReset.confirm'), style: 'destructive', onPress: onConfirm },
    ]);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.wrap}
      accessibilityLabel={t('components.sessionReset.title')}
      testID="session-reset-button"
    >
      <MaterialCommunityIcons name="account-remove" size={26} color="#ffffff" />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(97, 97, 97, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 1000,
  },
});

export default SessionResetButton;
