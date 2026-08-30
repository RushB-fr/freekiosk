import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  GestureResponderEvent,
} from 'react-native';
import { DashboardTile } from '../types/dashboard';
import { getColorForLabel } from '../utils/dashboardColors';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const numColumns = Math.max(1, Math.floor(width / (TILE_WIDTH + TILE_GAP)));

  const sortedTiles = [...tiles].sort((a, b) => a.order - b.order);

  // Track touch start to distinguish taps from scrolls
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const TAP_MAX_DISTANCE = 20;
  const TAP_MAX_DURATION = 500;

  const handleTouchStart = (e: GestureResponderEvent) => {
    touchStartRef.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.pageX - touchStartRef.current.x;
    const dy = e.nativeEvent.pageY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Only count as tap if finger didn't move much and was quick
    if (dist < TAP_MAX_DISTANCE && dt < TAP_MAX_DURATION && onUserInteraction) {
      onUserInteraction({ isTap: true, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    }
  };

  const renderTile = ({ item }: { item: DashboardTile }) => (
    <TouchableOpacity
      style={styles.tileContainer}
      onPress={() => {
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
    <View
      style={styles.gridWrapper}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <FlatList
      key={`grid-${numColumns}`}
      data={sortedTiles}
      renderItem={renderTile}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      contentContainerStyle={styles.gridContent}
      style={styles.grid}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {t('components.dashboardGrid.emptyText')}
          </Text>
        </View>
      }
    />
    </View>
  );
};

const styles = StyleSheet.create({
  gridWrapper: {
    flex: 1,
  },
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
