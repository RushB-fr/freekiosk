import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { DashboardTile } from '../types/dashboard';
import { getColorForLabel } from '../utils/dashboardColors';

interface DashboardGridProps {
  tiles: DashboardTile[];
  onTilePress: (tile: DashboardTile) => void;
  onUserInteraction?: (event?: { isTap?: boolean; x?: number; y?: number }) => void;
}

const TILE_WIDTH = 80;
const TILE_GAP = 16;
const ICON_SIZE = 56;

const TileIcon: React.FC<{ tile: DashboardTile }> = ({ tile }) => {
  const [imageError, setImageError] = useState(false);

  if (tile.iconMode === 'favicon' && !imageError) {
    const domain = tile.url.replace(/^https?:\/\//, '').split('/')[0];
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    return (
      <Image
        source={{ uri: faviconUrl }}
        style={styles.iconImage}
        onError={() => setImageError(true)}
      />
    );
  }

  if (tile.iconMode === 'image' && tile.iconValue && !imageError) {
    return (
      <Image
        source={{ uri: tile.iconValue }}
        style={styles.iconImage}
        onError={() => setImageError(true)}
      />
    );
  }

  // Letter mode (default / fallback)
  const color = getColorForLabel(tile.label);
  const letter = tile.label ? tile.label[0].toUpperCase() : '?';
  return (
    <View style={[styles.letterCircle, { backgroundColor: color }]}>
      <Text style={styles.letterText}>{letter}</Text>
    </View>
  );
};

const DashboardGrid: React.FC<DashboardGridProps> = ({ tiles, onTilePress, onUserInteraction }) => {
  const { width } = useWindowDimensions();
  const numColumns = Math.max(1, Math.floor(width / (TILE_WIDTH + TILE_GAP)));

  const sortedTiles = [...tiles].sort((a, b) => a.order - b.order);

  const renderTile = ({ item }: { item: DashboardTile }) => (
    <TouchableOpacity
      style={styles.tileContainer}
      onPress={(e) => {
        if (onUserInteraction) {
          onUserInteraction({ isTap: true, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
        }
        onTilePress(item);
      }}
      activeOpacity={0.7}
    >
      <TileIcon key={item.url + item.iconMode} tile={item} />
      <Text style={styles.tileLabel} numberOfLines={2}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <FlatList
      key={`grid-${numColumns}`}
      data={sortedTiles}
      renderItem={renderTile}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      contentContainerStyle={styles.gridContent}
      style={styles.grid}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      onTouchEnd={(e) => {
        if (onUserInteraction) {
          onUserInteraction({ isTap: true, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
        }
      }}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Configure your first tile in the Dashboard tab.
          </Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  gridContent: {
    flexGrow: 1,
    padding: TILE_GAP,
  },
  row: {
    justifyContent: 'flex-start',
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  tileContainer: {
    width: TILE_WIDTH,
    alignItems: 'center',
  },
  iconImage: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  letterCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  tileLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default DashboardGrid;
