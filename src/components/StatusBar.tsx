import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, NativeModules } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const { SystemInfoModule } = NativeModules;

interface SystemInfo {
  battery: {
    level: number;
    isCharging: boolean;
  };
  wifi: {
    isConnected: boolean;
  };
  bluetooth: {
    isEnabled: boolean;
    connectedDevices: number;
  };
  audio: {
    volume: number;
  };
}

interface StatusBarProps {
  showBattery?: boolean;
  showWifi?: boolean;
  showBluetooth?: boolean;
  showVolume?: boolean;
  showTime?: boolean;
  theme?: 'dark' | 'light';
  // Dashboard nav props
  dashboardMode?: boolean;
  navCanGoBack?: boolean;
  navCanGoForward?: boolean;
  navTitle?: string;
  showNavBar?: boolean;
  onNavBack?: () => void;
  onNavForward?: () => void;
  onNavRefresh?: () => void;
  onNavHome?: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  showBattery = true,
  showWifi = true,
  showBluetooth = true,
  showVolume = true,
  showTime = true,
  theme = 'dark',
  dashboardMode = false,
  navCanGoBack = false,
  navCanGoForward = false,
  navTitle = '',
  showNavBar = false,
  onNavBack,
  onNavForward,
  onNavRefresh,
  onNavHome,
}) => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateStatusBar = async () => {
      try {
        // Check if module exists
        if (!SystemInfoModule || !SystemInfoModule.getSystemInfo) {
          console.error('SystemInfoModule not available');
          return;
        }

        const info = await SystemInfoModule.getSystemInfo();

        // Validate data structure
        if (!info || !info.battery || !info.wifi || !info.bluetooth || !info.audio) {
          console.error('[StatusBar] Invalid system info structure:', info);
          return;
        }

        // Log battery level to debug update issues
        console.log('[StatusBar] Battery updated:', info.battery.level, '%', info.battery.isCharging ? 'charging' : '');

        setSystemInfo(info);

        // Update time
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        setCurrentTime(`${hours}:${minutes}`);
      } catch (error) {
        console.error('[StatusBar] Failed to get system info:', error);
      }
    };

    // Initial update
    updateStatusBar();
    
    // Set up interval to update every 5 seconds
    const interval = setInterval(updateStatusBar, 5000);

    return () => {
      clearInterval(interval);
      // Clean up state when unmounting
      setSystemInfo(null);
    };
  }, [showBattery, showWifi, showBluetooth, showVolume, showTime]);

  if (!systemInfo && !dashboardMode) {
    return null;
  }

  // Safe accessors with defaults (systemInfo can be null when only dashboardMode is active)
  const batteryLevel = systemInfo?.battery?.level ?? 0;
  const isCharging = systemInfo?.battery?.isCharging ?? false;
  const wifiConnected = systemInfo?.wifi?.isConnected ?? false;
  const bluetoothEnabled = systemInfo?.bluetooth?.isEnabled ?? false;
  const bluetoothDevices = systemInfo?.bluetooth?.connectedDevices ?? 0;
  const audioVolume = systemInfo?.audio?.volume ?? 0;
  const isLightTheme = theme === 'light';

  const colors = {
    barBackground: isLightTheme ? 'rgba(255, 255, 255, 0.92)' : 'rgba(0, 0, 0, 0.88)',
    text: isLightTheme ? '#1F2937' : '#FFFFFF',
    icon: isLightTheme ? '#1F2937' : '#FFFFFF',
    connected: '#22C55E',
    disconnected: '#EF4444',
  };

  const getBatteryIconName = (level: number, charging: boolean) => {
    if (charging) {
      return 'battery-charging';
    }

    if (level <= 10) {
      return 'battery-alert';
    }

    if (level <= 25) {
      return 'battery-20';
    }

    if (level <= 50) {
      return 'battery-50';
    }

    if (level <= 75) {
      return 'battery-80';
    }

    return 'battery';
  };

  const getVolumeIconName = (volume: number) => {
    if (volume === 0) {
      return 'volume-off';
    }

    if (volume <= 33) {
      return 'volume-low';
    }

    if (volume <= 66) {
      return 'volume-medium';
    }

    return 'volume-high';
  };

  // Organize items: left side and right side to avoid center (camera)
  const leftItems = [];
  const rightItems = [];

  // Battery - left side
  if (showBattery) {
    leftItems.push(
      <View key="battery" style={styles.item}>
        <MaterialCommunityIcons
          name={getBatteryIconName(batteryLevel, isCharging)}
          size={14}
          color={colors.icon}
          style={styles.iconMaterial}
        />
        <Text style={[styles.text, { color: colors.text }]}>{batteryLevel}%</Text>
      </View>
    );
  }

  // WiFi - left side
  if (showWifi) {
    leftItems.push(
      <View key="wifi" style={styles.item}>
        <MaterialCommunityIcons
          name={wifiConnected ? 'wifi' : 'wifi-off'}
          size={14}
          color={colors.icon}
          style={styles.iconMaterial}
        />
        <MaterialCommunityIcons
          name={wifiConnected ? 'check-circle' : 'close-circle'}
          size={13}
          color={wifiConnected ? colors.connected : colors.disconnected}
        />
      </View>
    );
  }

  // Bluetooth - left side
  if (showBluetooth) {
    leftItems.push(
      <View key="bluetooth" style={styles.item}>
        <MaterialCommunityIcons
          name={bluetoothEnabled ? 'bluetooth' : 'bluetooth-off'}
          size={14}
          color={colors.icon}
          style={styles.iconMaterial}
        />
        <MaterialCommunityIcons
          name={(bluetoothEnabled && bluetoothDevices > 0) ? 'check-circle' : 'close-circle'}
          size={13}
          color={(bluetoothEnabled && bluetoothDevices > 0) ? colors.connected : colors.disconnected}
        />
      </View>
    );
  }

  // Volume - right side
  if (showVolume) {
    rightItems.push(
      <View key="volume" style={styles.item}>
        <MaterialCommunityIcons
          name={getVolumeIconName(audioVolume)}
          size={14}
          color={colors.icon}
          style={styles.iconMaterial}
        />
        <Text style={[styles.text, { color: colors.text }]}>{audioVolume}%</Text>
      </View>
    );
  }

  // Time - right side
  if (showTime) {
    rightItems.push(
      <View key="time" style={styles.item}>
        <MaterialCommunityIcons name="clock-outline" size={14} color={colors.icon} style={styles.iconMaterial} />
        <Text style={[styles.text, { color: colors.text }]}>{currentTime}</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Line 1: System info */}
      {systemInfo && (showBattery || showWifi || showBluetooth || showVolume || showTime) && (
        <View style={[styles.container, { backgroundColor: colors.barBackground }]}>
          <View style={styles.leftSide}>
            {leftItems}
          </View>
          <View style={styles.spacer} />
          <View style={styles.rightSide}>
            {rightItems}
          </View>
        </View>
      )}

      {/* Line 2: Dashboard navigation */}
      {dashboardMode && (
        <View style={[styles.navContainer, { backgroundColor: colors.barBackground }]}>
          <TouchableOpacity
            onPress={onNavBack}
            disabled={!showNavBar || !navCanGoBack}
            style={styles.navButton}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={18}
              color={colors.icon}
              style={{ opacity: (!showNavBar || !navCanGoBack) ? 0.3 : 1 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onNavForward}
            disabled={!showNavBar || !navCanGoForward}
            style={styles.navButton}
          >
            <MaterialCommunityIcons
              name="arrow-right"
              size={18}
              color={colors.icon}
              style={{ opacity: (!showNavBar || !navCanGoForward) ? 0.3 : 1 }}
            />
          </TouchableOpacity>

          {showNavBar && (
            <TouchableOpacity onPress={onNavRefresh} style={styles.navButton}>
              <MaterialCommunityIcons name="refresh" size={18} color={colors.icon} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onNavHome}
            disabled={!showNavBar}
            style={styles.navButton}
          >
            <MaterialCommunityIcons
              name="home"
              size={18}
              color={colors.icon}
              style={{ opacity: !showNavBar ? 0.3 : 1 }}
            />
          </TouchableOpacity>

          <Text
            style={[styles.navTitle, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {navTitle || 'Dashboard'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  leftSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  icon: {
    fontSize: 14,
    marginRight: 3,
  },
  iconMaterial: {
    fontSize: 14,
    marginRight: 3,
    fontWeight: '500',
  },
  text: {
    fontSize: 12,
    minWidth: 30,
  },
  spacer: {
    flex: 1,
  },
  navContainer: {
    height: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  navButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navTitle: {
    fontSize: 13,
    flex: 1,
    marginLeft: 4,
  },
});

export default StatusBar;
