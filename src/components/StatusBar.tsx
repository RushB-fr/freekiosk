import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, NativeModules } from 'react-native';

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

const StatusBar: React.FC = () => {
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

    updateStatusBar();
    const interval = setInterval(updateStatusBar, 5000);

    return () => clearInterval(interval);
  }, []);

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

  return (
    <View style={styles.container}>
      {/* Battery */}
      <View style={styles.item}>
        <Text style={styles.icon}>🔋</Text>
        <Text style={styles.text}>{batteryLevel}%</Text>
        {isCharging && <Text style={styles.charging}>⚡</Text>}
      </View>

      {/* WiFi */}
      <View style={styles.item}>
        <Text style={styles.icon}>📶</Text>
        <Text style={wifiConnected ? styles.statusConnected : styles.statusDisconnected}>
          {wifiConnected ? '✓' : '✗'}
        </Text>
      </View>

      {/* Bluetooth */}
      <View style={styles.item}>
        <Text style={styles.icon}>🔵</Text>
        <Text style={(bluetoothEnabled && bluetoothDevices > 0) ? styles.statusConnected : styles.statusDisconnected}>
          {(bluetoothEnabled && bluetoothDevices > 0) ? '✓' : '✗'}
        </Text>
      </View>

      {/* Volume */}
      <View style={styles.item}>
        <Text style={styles.icon}>
          {audioVolume === 0 ? '🔇' :
           audioVolume <= 33 ? '🔉' :
           audioVolume <= 66 ? '🔊' : '📢'}
        </Text>
        <Text style={styles.text}>{audioVolume}%</Text>
      </View>

      {/* Spacer */}
      <View style={styles.spacer} />

      {/* Time */}
      <View style={styles.item}>
        <Text style={styles.icon}>🕐</Text>
        <Text style={styles.text}>{currentTime}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 16,
    marginRight: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  charging: {
    fontSize: 12,
    marginLeft: 2,
  },
  statusConnected: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusDisconnected: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: 'bold',
  },
  spacer: {
    flex: 1,
  },
});

export default StatusBar;
