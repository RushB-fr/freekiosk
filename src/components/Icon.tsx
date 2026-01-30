/**
 * FreeKiosk v1.2 - Icon Component
 * Centralized icon system using Material Design Icons
 */

import React from 'react';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Colors from '../theme/colors';

export type IconName =
  // Navigation & General
  | 'home'
  | 'cog'
  | 'cog-outline'
  | 'arrow-left'
  | 'close'
  | 'check'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'dots-vertical'
  | 'menu'
  // Display & Screen
  | 'monitor'
  | 'cellphone'
  | 'tablet'
  | 'android'
  | 'brightness-6'
  | 'brightness-4'
  | 'brightness-7'
  | 'brightness-auto'
  | 'moon-waning-crescent'
  | 'weather-night'
  | 'eye'
  | 'eye-off'
  // Web & URL
  | 'web'
  | 'earth'
  | 'link'
  | 'link-variant'
  | 'open-in-new'
  | 'refresh'
  | 'sync'
  | 'rotate-3d-variant'
  // Security
  | 'lock'
  | 'lock-outline'
  | 'lock-open'
  | 'shield'
  | 'shield-check'
  | 'shield-lock'
  | 'key'
  | 'key-variant'
  | 'pin'
  | 'pin-outline'
  | 'fingerprint'
  // Time & Schedule
  | 'clock'
  | 'clock-outline'
  | 'calendar'
  | 'calendar-clock'
  | 'calendar-today'
  | 'calendar-month'
  | 'calendar-repeat'
  | 'timer'
  | 'timer-sand'
  | 'history'
  // Actions
  | 'play'
  | 'pause'
  | 'stop'
  | 'pencil'
  | 'delete'
  | 'delete-outline'
  | 'plus'
  | 'minus'
  | 'plus-circle'
  | 'plus-circle-outline'
  | 'content-copy'
  | 'download'
  | 'upload'
  | 'magnify'
  | 'information'
  | 'information-outline'
  | 'alert'
  | 'alert-circle'
  | 'alert-circle-outline'
  | 'help-circle'
  | 'help-circle-outline'
  // Apps & System
  | 'apps'
  | 'package-variant'
  | 'application'
  | 'rocket-launch'
  | 'rocket-launch-outline'
  | 'power'
  | 'exit-to-app'
  | 'door-open'
  | 'restart'
  | 'update'
  // Status
  | 'check-circle'
  | 'check-circle-outline'
  | 'close-circle'
  | 'close-circle-outline'
  | 'checkbox-marked'
  | 'checkbox-blank-outline'
  | 'radiobox-marked'
  | 'radiobox-blank'
  | 'toggle-switch'
  | 'toggle-switch-off'
  // Features
  | 'camera'
  | 'camera-outline'
  | 'motion-sensor'
  | 'keyboard'
  | 'keyboard-outline'
  | 'certificate'
  | 'certificate-outline'
  | 'chart-bar'
  | 'format-list-bulleted'
  | 'view-list'
  | 'flash'
  | 'flash-outline'
  | 'test-tube'
  | 'speedometer'
  | 'gesture-tap'
  | 'gesture-tap-button'
  | 'undo'
  | 'arrow-u-left-top'
  // Arrow directions
  | 'arrow-top-left'
  | 'arrow-top-right'
  | 'arrow-bottom-left'
  | 'arrow-bottom-right'
  // Shapes & Grid
  | 'grid'
  | 'rectangle-outline'
  | 'square-outline'
  | 'lightbulb-outline'
  | 'stop'
  // API & Network
  | 'api'
  | 'server-network'
  | 'server'
  | 'remote'
  | 'numeric'
  | 'home-assistant';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: object;
}

const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = Colors.textPrimary,
  style,
}) => {
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color}
      style={style}
    />
  );
};

// Icon mapping for easy reference - maps semantic names to icon names
export const IconMap = {
  // Tabs
  tabGeneral: 'home' as IconName,
  tabDisplay: 'monitor' as IconName,
  tabSecurity: 'shield-lock' as IconName,
  tabAdvanced: 'cog' as IconName,
  
  // General Tab
  displayMode: 'cellphone' as IconName,
  website: 'web' as IconName,
  androidApp: 'package-variant' as IconName,
  url: 'link-variant' as IconName,
  urlRotation: 'sync' as IconName,
  urlPlanner: 'calendar-clock' as IconName,
  application: 'apps' as IconName,
  clipboard: 'content-copy' as IconName,
  pinCode: 'pin' as IconName,
  autoReload: 'refresh' as IconName,
  backToKiosk: 'arrow-u-left-top' as IconName,
  
  // Display Tab
  brightness: 'brightness-6' as IconName,
  brightnessAuto: 'brightness-auto' as IconName,
  screensaver: 'weather-night' as IconName,
  inactivityDelay: 'timer-sand' as IconName,
  motionDetection: 'motion-sensor' as IconName,
  statusBar: 'chart-bar' as IconName,
  keyboard: 'keyboard-outline' as IconName,
  
  // Security Tab
  lockMode: 'lock' as IconName,
  autoLaunch: 'rocket-launch' as IconName,
  bootBehavior: 'power' as IconName,
  externalApp: 'application' as IconName,
  backButton: 'undo' as IconName,
  testMode: 'test-tube' as IconName,
  fastMode: 'flash' as IconName,
  delayMode: 'timer' as IconName,
  
  // Advanced Tab
  updates: 'update' as IconName,
  download: 'download' as IconName,
  search: 'magnify' as IconName,
  certificates: 'certificate-outline' as IconName,
  actions: 'cog-outline' as IconName,
  reload: 'refresh' as IconName,
  warning: 'alert' as IconName,
  exit: 'exit-to-app' as IconName,
  
  // Planner
  recurring: 'calendar-repeat' as IconName,
  oneTime: 'calendar-today' as IconName,
  empty: 'calendar' as IconName,
  
  // Actions
  play: 'play' as IconName,
  pause: 'pause' as IconName,
  edit: 'pencil' as IconName,
  delete: 'delete-outline' as IconName,
  add: 'plus-circle-outline' as IconName,
  
  // Status
  enabled: 'checkbox-marked' as IconName,
  disabled: 'checkbox-blank-outline' as IconName,
  check: 'check' as IconName,
  close: 'close' as IconName,
  info: 'information-outline' as IconName,
  help: 'help-circle-outline' as IconName,
};

export default Icon;
