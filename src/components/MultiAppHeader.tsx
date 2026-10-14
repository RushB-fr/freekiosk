import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  MultiAppAppearance,
  getMultiAppForeground,
} from '../types/multiAppAppearance';

interface Props {
  appearance: MultiAppAppearance;
}

const MultiAppHeader: React.FC<Props> = ({ appearance }) => {
  const [failedLogoUri, setFailedLogoUri] = useState<string | null>(null);
  useEffect(() => {
    setFailedLogoUri(null);
  }, [appearance.logoUri]);
  const customLogo = appearance.logoUri && failedLogoUri !== appearance.logoUri;
  const showTitle = appearance.showTitle && appearance.title.trim().length > 0;
  if (!appearance.showLogo && !showTitle) return null;

  return (
    <View style={styles.header}>
      {appearance.showLogo && (
        <Image
          source={
            customLogo
              ? { uri: appearance.logoUri }
              : require('../assets/images/logo_circle.png')
          }
          style={[styles.logo, customLogo ? styles.customLogo : null]}
          resizeMode="contain"
          onError={() => {
            if (customLogo) setFailedLogoUri(appearance.logoUri);
          }}
        />
      )}
      {showTitle && (
        <Text
          style={[
            styles.title,
            { color: getMultiAppForeground(appearance.backgroundColor) },
          ]}
          numberOfLines={2}
        >
          {appearance.title}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  logo: { width: 32, height: 32 },
  customLogo: { width: 80 },
  title: { flex: 1, fontSize: 20, fontWeight: 'bold' },
});

export default MultiAppHeader;
