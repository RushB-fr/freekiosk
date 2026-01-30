import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, NativeModules } from 'react-native';
import { StorageService } from '../utils/storage';

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
}

const StatusBar: React.FC<StatusBarProps> = ({
  showBattery = true,
  showWifi = true,
  showBluetooth = true,
  showVolume = true,
  showTime = true,
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
        console.log('[StatusBar] Battery updated:', info.battery.level, '%', info.battery.isCharging ? '⚡' : '');

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

  if (!systemInfo) {
    return null;
  }

  // Safe accessors with defaults
  const batteryLevel = systemInfo.battery?.level ?? 0;
  const isCharging = systemInfo.battery?.isCharging ?? false;
  const wifiConnected = systemInfo.wifi?.isConnected ?? false;
  const bluetoothEnabled = systemInfo.bluetooth?.isEnabled ?? false;
  const bluetoothDevices = systemInfo.bluetooth?.connectedDevices ?? 0;
  const audioVolume = systemInfo.audio?.volume ?? 0;

  // Organize items: left side and right side to avoid center (camera)
  const leftItems = [];
  const rightItems = [];

  // Battery - left side
  if (showBattery) {
    leftItems.push(
      <View key="battery" style={styles.item}>
        {isCharging && <Text style={styles.chargingLeft}>⚡</Text>}
        <Text style={styles.icon}>🔋</Text>
        <Text style={styles.text}>{batteryLevel}%</Text>
      </View>
    );
  }

  // WiFi - left side
  if (showWifi) {
    leftItems.push(
      <View key="wifi" style={styles.item}>
        <Text style={styles.icon}>📶</Text>
        <Text style={wifiConnected ? styles.statusConnected : styles.statusDisconnected}>
          {wifiConnected ? '✓' : '✗'}
        </Text>
      </View>
    );
  }

  // Bluetooth - left side
  if (showBluetooth) {
    leftItems.push(
      <View key="bluetooth" style={styles.item}>
        <Text style={styles.icon}>🔵</Text>
        <Text style={(bluetoothEnabled && bluetoothDevices > 0) ? styles.statusConnected : styles.statusDisconnected}>
          {(bluetoothEnabled && bluetoothDevices > 0) ? '✓' : '✗'}
        </Text>
      </View>
    );
  }

  // Volume - right side
  if (showVolume) {
    rightItems.push(
      <View key="volume" style={styles.item}>
        <Text style={styles.icon}>
          {audioVolume === 0 ? '🔇' :
           audioVolume <= 33 ? '🔉' :
           audioVolume <= 66 ? '🔊' : '📢'}
        </Text>
        <Text style={styles.text}>{audioVolume}%</Text>
      </View>
    );
  }

  // Time - right side
  if (showTime) {
    rightItems.push(
      <View key="time" style={styles.item}>
        <Text style={styles.icon}>🕐</Text>
        <Text style={styles.text}>{currentTime}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Left side items */}
      <View style={styles.leftSide}>
        {leftItems}
      </View>
      
      {/* Spacer to avoid center (camera area) */}
      <View style={styles.spacer} />
      
      {/* Right side items */}
      <View style={styles.rightSide}>
        {rightItems}
      </View>
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
    color: '#FFFFFF',
    fontWeight: '500',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    minWidth: 30,
  },
  charging: {
    fontSize: 11,
    marginLeft: 0,
  },
  chargingLeft: {
    fontSize: 11,
    marginRight: 0,
  },
  statusConnected: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusDisconnected: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: 'bold',
  },
  spacer: {
    flex: 1,
  },
});

export default StatusBar;
