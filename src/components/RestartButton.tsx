/**
 * FreeKiosk - RestartButton
 *
 * Top-right overlay button that reloads the WebView on a long-press. While held, the
 * circle fills with grey clockwise (pie/progress style) over `longPressSeconds`; releasing
 * before completion cancels and empties the ring. Completion triggers onTrigger().
 *
 * The circular fill is built without any SVG dependency: two clipped half-discs are
 * rotated around the circle center (transformOrigin), phase 1 sweeps the right half
 * (0→50%), phase 2 the left half (50→100%), producing a clean clockwise fill from 12 o'clock.
 */
import React, { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface RestartButtonProps {
  /** How long (seconds) the button must be held before it triggers. */
  longPressSeconds: number;
  /** Called when the hold completes. */
  onTrigger: () => void;
}

const SIZE = 50;
const HALF = SIZE / 2;
const FILL = '#616161'; // solid grey (filled)
const TRACK = 'rgba(97, 97, 97, 0.28)'; // faint grey (empty)

const RestartButton: React.FC<RestartButtonProps> = ({ longPressSeconds, onTrigger }) => {
  const progress = useRef(new Animated.Value(0)).current;
  const completedRef = useRef(false);
  const durationMs = Math.max(1, longPressSeconds) * 1000;

  const start = () => {
    completedRef.current = false;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        completedRef.current = true;
        onTrigger();
        progress.setValue(0); // reset the fill after firing
      }
    });
  };

  const cancel = () => {
    if (completedRef.current) return; // hold already completed and fired
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // Right half fills over the first 50%, left half over the second 50%.
  const rightRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '180deg', '180deg'],
    extrapolate: 'clamp',
  });
  const leftRotate = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '0deg', '180deg'],
    extrapolate: 'clamp',
  });

  return (
    <Pressable onPressIn={start} onPressOut={cancel} style={styles.wrap}>
      <View style={styles.track}>
        {/* Right half of the circle (fills during the first half of the hold) */}
        <View style={styles.rightClip}>
          <Animated.View style={[styles.rightFill, { transform: [{ rotate: rightRotate }] }]} />
        </View>
        {/* Left half of the circle (fills during the second half of the hold) */}
        <View style={styles.leftClip}>
          <Animated.View style={[styles.leftFill, { transform: [{ rotate: leftRotate }] }]} />
        </View>
      </View>
      <MaterialCommunityIcons name="refresh" size={28} color="#ffffff" style={styles.icon} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: SIZE,
    height: SIZE,
    borderRadius: HALF,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 1000,
  },
  track: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: HALF,
    backgroundColor: TRACK,
    overflow: 'hidden',
  },
  rightClip: {
    position: 'absolute',
    left: HALF,
    top: 0,
    width: HALF,
    height: SIZE,
    overflow: 'hidden',
  },
  rightFill: {
    position: 'absolute',
    left: -HALF,
    top: 0,
    width: HALF,
    height: SIZE,
    backgroundColor: FILL,
    borderTopLeftRadius: HALF,
    borderBottomLeftRadius: HALF,
    transformOrigin: 'right center',
  },
  leftClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: HALF,
    height: SIZE,
    overflow: 'hidden',
  },
  leftFill: {
    position: 'absolute',
    left: HALF,
    top: 0,
    width: HALF,
    height: SIZE,
    backgroundColor: FILL,
    borderTopRightRadius: HALF,
    borderBottomRightRadius: HALF,
    transformOrigin: 'left center',
  },
  icon: {
    zIndex: 1,
  },
});

export default RestartButton;
