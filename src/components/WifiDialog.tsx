/**
 * WifiDialog — lock-screen WiFi manager.
 *
 * Renders as a full-screen modal so it works whether it's shown from the
 * PIN screen or from the kiosk swipe-down panel.  Never launches the system
 * Settings app, so it cannot be used as a back-door into other settings.
 *
 * Android 10+ note: WifiManager.setWifiEnabled() is blocked for non-system
 * apps on API 29+.  When the native module returns requiresSystemPanel=true
 * we open Settings.Panel.ACTION_WIFI (a bottom-sheet overlay, not the full
 * Settings app), which is the only safe option on those versions.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Switch,
  DeviceEventEmitter,
  Alert,
  Platform,
} from 'react-native';
import { NativeModules } from 'react-native';
import {
  clearSecureWifiPassword,
  getSecureWifiPassword,
  saveSecureWifiPassword,
} from '../utils/secureStorage';

const { WifiControlModule } = NativeModules;

interface WifiNetwork {
  ssid: string;
  bssid: string;
  signalLevel: number; // 0–4
  secured: boolean;
  capabilities: string;
}

interface WifiInfo {
  isEnabled: boolean;
  isConnected: boolean;
  ssid: string;
  signalLevel: number;
  rssi: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SIGNAL_ICONS = ['▂___', '▂▄__', '▂▄▆_', '▂▄▆█'];

export default function WifiDialog({ visible, onClose }: Props) {
  const [wifiInfo, setWifiInfo] = useState<WifiInfo | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null); // ssid being connected
  const [passwordSsid, setPasswordSsid] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [togglingWifi, setTogglingWifi] = useState(false);
  const [disconnectingWifi, setDisconnectingWifi] = useState(false);
  const wifiInfoRef = useRef<WifiInfo | null>(null);
  const connectingRef = useRef<string | null>(null);
  const autoConnectingSsidRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const info: WifiInfo = await WifiControlModule.getWifiInfo();
      setWifiInfo(info);
    } catch (e) {
      console.warn('[WifiDialog] getWifiInfo error:', e);
    }
  }, []);

  useEffect(() => {
    wifiInfoRef.current = wifiInfo;
  }, [wifiInfo]);

  useEffect(() => {
    connectingRef.current = connecting;
  }, [connecting]);

  useEffect(() => {
    if (!visible) return;
    refresh();

    const sub = DeviceEventEmitter.addListener('wifiScanResults', (results: WifiNetwork[]) => {
      setNetworks(results);
      setScanning(false);
      void autoConnectKnownNetwork(results);
    });
    return () => sub.remove();
  }, [visible, refresh]);

  const handleToggleWifi = async () => {
    if (!wifiInfo || togglingWifi) return;
    const previousInfo = wifiInfo;
    const nextEnabled = !wifiInfo.isEnabled;
    setTogglingWifi(true);
    setWifiInfo({
      ...wifiInfo,
      isEnabled: nextEnabled,
      isConnected: nextEnabled ? wifiInfo.isConnected : false,
      ssid: nextEnabled ? wifiInfo.ssid : '',
      signalLevel: nextEnabled ? wifiInfo.signalLevel : 0,
      rssi: nextEnabled ? wifiInfo.rssi : 0,
    });
    if (!nextEnabled) {
      setNetworks([]);
      setConnecting(null);
    }

    try {
      const result = await WifiControlModule.setWifiEnabled(nextEnabled);
      if (result.requiresSystemPanel) {
        setWifiInfo(previousInfo);
        // Android 10+: WifiManager.setWifiEnabled() is blocked for non-system apps.
        // We do NOT open the system Settings panel — that would create a potential
        // escape route from kiosk mode. Instead inform the user.
        Alert.alert(
          'WiFi toggle unavailable',
          'On this Android version, WiFi can only be toggled via the device status bar or by an administrator. Connect to a network below while WiFi is already on.'
        );
      } else if (result.success === false) {
        setWifiInfo(previousInfo);
        Alert.alert('Wi-Fi toggle failed', `Could not turn Wi-Fi ${nextEnabled ? 'on' : 'off'}.`);
      } else {
        setTimeout(async () => {
          await refresh();
          if (nextEnabled) {
            handleScan(true);
          }
        }, 800);
      }
    } catch (e) {
      setWifiInfo(previousInfo);
      console.warn('[WifiDialog] toggle error:', e);
      Alert.alert('Wi-Fi toggle failed', `Could not turn Wi-Fi ${nextEnabled ? 'on' : 'off'}.`);
    } finally {
      setTogglingWifi(false);
    }
  };

  const handleScan = async (force = false) => {
    if (scanning || (!force && !wifiInfo?.isEnabled)) return;
    setScanning(true);
    setNetworks([]);
    try {
      const started = await WifiControlModule.startScan();
      if (!started) {
        const cachedResults: WifiNetwork[] = await WifiControlModule.getScanResults();
        setNetworks(cachedResults);
        setScanning(false);
      }
      // Results arrive via 'wifiScanResults' event
      // Safety timeout in case the event never fires
      setTimeout(() => setScanning(false), 12000);
    } catch (e: any) {
      setScanning(false);
      console.warn('[WifiDialog] scan error:', e);
      Alert.alert('Wi-Fi scan unavailable', e?.message || 'FreeKiosk does not have permission to scan for Wi-Fi networks.');
    }
  };

  const handleNetworkTap = async (network: WifiNetwork) => {
    const isCurrentNetwork = wifiInfo?.isConnected && wifiInfo.ssid === network.ssid;
    if (isCurrentNetwork) {
      await refresh();
      return;
    }

    if (network.secured) {
      const savedPassword = await getSecureWifiPassword(network.ssid);
      if (savedPassword) {
        connectTo(network.ssid, savedPassword, true);
        return;
      }

      setPasswordSsid(network.ssid);
      setPassword('');
    } else {
      connectTo(network.ssid, '');
    }
  };

  const connectTo = async (ssid: string, pwd: string, usedSavedPassword = false) => {
    setPasswordSsid(null);
    setConnecting(ssid);
    connectingRef.current = ssid;
    try {
      const result = await WifiControlModule.connectToNetwork(ssid, pwd);
      if (result.success) {
        if (pwd) {
          await saveSecureWifiPassword(ssid, pwd);
        }
        await refresh();
      } else {
        if (usedSavedPassword) {
          await clearSecureWifiPassword(ssid);
          setPasswordSsid(ssid);
          setPassword('');
          Alert.alert('Saved Wi-Fi password failed', `Enter the password for "${ssid}" again.`);
          return;
        }
        Alert.alert('Connection failed', `Could not connect to "${ssid}"`);
      }
    } catch (e: any) {
      if (usedSavedPassword) {
        await clearSecureWifiPassword(ssid);
        setPasswordSsid(ssid);
        setPassword('');
        Alert.alert('Saved Wi-Fi password failed', e?.message || `Enter the password for "${ssid}" again.`);
        return;
      }
      Alert.alert('Connection failed', e?.message || `Could not connect to "${ssid}"`);
    } finally {
      setConnecting(null);
      connectingRef.current = null;
      if (autoConnectingSsidRef.current === ssid) {
        autoConnectingSsidRef.current = null;
      }
    }
  };

  const autoConnectKnownNetwork = async (scanResults: WifiNetwork[]) => {
    const currentInfo = wifiInfoRef.current;
    if (!currentInfo?.isEnabled || currentInfo.isConnected || connectingRef.current || autoConnectingSsidRef.current) {
      return;
    }

    for (const network of scanResults) {
      if (!network.secured) continue;
      const savedPassword = await getSecureWifiPassword(network.ssid);
      if (!savedPassword) continue;

      autoConnectingSsidRef.current = network.ssid;
      connectTo(network.ssid, savedPassword, true);
      return;
    }
  };

  const handleDisconnect = async () => {
    if (!wifiInfo?.isConnected || disconnectingWifi) return;
    const previousInfo = wifiInfo;
    setDisconnectingWifi(true);
    setWifiInfo({
      ...wifiInfo,
      isConnected: false,
      ssid: '',
      signalLevel: 0,
      rssi: 0,
    });
    try {
      const result = await WifiControlModule.disconnectFromCurrentNetwork();
      if (result.success === false) {
        setWifiInfo(previousInfo);
        Alert.alert('Disconnect failed', `Could not disconnect from "${previousInfo.ssid}".`);
      } else {
        setTimeout(refresh, 700);
        setTimeout(refresh, 1800);
      }
    } catch (e: any) {
      setWifiInfo(previousInfo);
      Alert.alert('Disconnect failed', e?.message || `Could not disconnect from "${previousInfo.ssid}".`);
    } finally {
      setDisconnectingWifi(false);
    }
  };

  const signalIcon = (level: number) => SIGNAL_ICONS[Math.min(level, 3)] ?? SIGNAL_ICONS[0];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📶  Wi-Fi</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Toggle row */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Wi-Fi</Text>
          <Switch
            value={wifiInfo?.isEnabled ?? false}
            onValueChange={handleToggleWifi}
            disabled={togglingWifi}
            trackColor={{ false: '#ccc', true: '#4caf50' }}
            thumbColor="#fff"
          />
        </View>

        {wifiInfo?.isEnabled && (
          <>
            {/* Current connection */}
            {wifiInfo.isConnected && (
              <View style={styles.connectedBanner}>
                <Text style={styles.connectedText}>
                  ✓ Connected: {wifiInfo.ssid}{'  '}
                  {signalIcon(wifiInfo.signalLevel)}
                </Text>
                <TouchableOpacity
                  style={[styles.disconnectBtn, disconnectingWifi && styles.disconnectBtnDisabled]}
                  onPress={handleDisconnect}
                  disabled={disconnectingWifi}
                >
                  {disconnectingWifi ? (
                    <ActivityIndicator color="#2e7d32" size="small" />
                  ) : (
                    <Text style={styles.disconnectBtnText}>Disconnect</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Scan button */}
            <TouchableOpacity
              style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
              onPress={() => handleScan()}
              disabled={scanning}
            >
              {scanning ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.scanBtnText}>🔍  Scan for networks</Text>
              )}
            </TouchableOpacity>

            {/* Network list */}
            <FlatList
              data={networks}
              keyExtractor={(n) => n.bssid || n.ssid}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isConnecting = connecting === item.ssid;
                const isCurrentNetwork = wifiInfo.isConnected && wifiInfo.ssid === item.ssid;
                return (
                  <TouchableOpacity
                    style={[styles.networkRow, isCurrentNetwork && styles.networkRowActive]}
                    onPress={() => handleNetworkTap(item)}
                    disabled={isConnecting}
                  >
                    <View style={styles.networkInfo}>
                      <Text style={styles.networkSsid} numberOfLines={1}>
                        {item.ssid}
                      </Text>
                      <Text style={styles.networkMeta}>
                        {item.secured ? '🔒' : '🔓'}{'  '}{signalIcon(item.signalLevel)}
                      </Text>
                    </View>
                    {isConnecting ? (
                      <ActivityIndicator color="#0066cc" size="small" />
                    ) : isCurrentNetwork ? (
                      <Text style={styles.connectedBadge}>Connected</Text>
                    ) : (
                      <Text style={styles.connectArrow}>›</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                !scanning ? (
                  <Text style={styles.emptyText}>Tap "Scan" to find networks</Text>
                ) : null
              }
            />
          </>
        )}

        {!wifiInfo?.isEnabled && (
          <Text style={styles.disabledText}>Turn on Wi-Fi to see available networks.</Text>
        )}
      </View>

      {/* Password dialog */}
      {passwordSsid !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setPasswordSsid(null)}
        >
          <View style={styles.pwdOverlay}>
            <View style={styles.pwdCard}>
              <Text style={styles.pwdTitle}>Connect to</Text>
              <Text style={styles.pwdSsid} numberOfLines={1}>{passwordSsid}</Text>

              <View style={styles.pwdInputRow}>
                <TextInput
                  style={styles.pwdInput}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="Password"
                  placeholderTextColor="#999"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Text style={styles.eyeBtnText}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.pwdActions}>
                <TouchableOpacity
                  style={styles.pwdCancel}
                  onPress={() => setPasswordSsid(null)}
                >
                  <Text style={styles.pwdCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pwdConnect, !password && styles.pwdConnectDisabled]}
                  onPress={() => connectTo(passwordSsid!, password, false)}
                  disabled={!password}
                >
                  <Text style={styles.pwdConnectText}>Connect</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0066cc',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6c9',
  },
  connectedText: {
    color: '#2e7d32',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  disconnectBtn: {
    minWidth: 104,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2e7d32',
    borderRadius: 6,
    paddingHorizontal: 10,
  },
  disconnectBtnDisabled: {
    opacity: 0.6,
  },
  disconnectBtnText: {
    color: '#2e7d32',
    fontSize: 13,
    fontWeight: '700',
  },
  scanBtn: {
    backgroundColor: '#0066cc',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanBtnDisabled: {
    backgroundColor: '#999',
  },
  scanBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 1,
  },
  networkRowActive: {
    borderWidth: 2,
    borderColor: '#0066cc',
  },
  networkInfo: {
    flex: 1,
  },
  networkSsid: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  networkMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
    letterSpacing: 1,
  },
  connectedBadge: {
    fontSize: 13,
    color: '#0066cc',
    fontWeight: '700',
  },
  connectArrow: {
    fontSize: 24,
    color: '#999',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 15,
  },
  disabledText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 60,
    fontSize: 16,
    paddingHorizontal: 40,
  },
  // Password dialog
  pwdOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pwdCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  pwdTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  pwdSsid: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 20,
  },
  pwdInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0066cc',
    borderRadius: 8,
    marginBottom: 20,
  },
  pwdInput: {
    flex: 1,
    height: 52,
    paddingHorizontal: 14,
    fontSize: 18,
    color: '#333',
  },
  eyeBtn: {
    paddingHorizontal: 12,
  },
  eyeBtnText: {
    fontSize: 20,
  },
  pwdActions: {
    flexDirection: 'row',
    gap: 12,
  },
  pwdCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  pwdCancelText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  pwdConnect: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#0066cc',
    alignItems: 'center',
  },
  pwdConnectDisabled: {
    backgroundColor: '#aaa',
  },
  pwdConnectText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
});
