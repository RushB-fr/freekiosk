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
import Icon, { IconName } from './Icon';
import { useTranslation } from 'react-i18next';

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

const SIGNAL_ICONS: IconName[] = ['wifi-strength-1', 'wifi-strength-2', 'wifi-strength-3', 'wifi-strength-4'];

export default function WifiDialog({ visible, onClose }: Props) {
  const { t } = useTranslation();
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
          t('components.wifiDialog.toggleUnavailableTitle'),
          t('components.wifiDialog.toggleUnavailableMessage')
        );
      } else if (result.success === false) {
        setWifiInfo(previousInfo);
        Alert.alert(t('components.wifiDialog.toggleFailedTitle'), t('components.wifiDialog.toggleFailedMessage', { state: nextEnabled ? t('components.wifiDialog.on') : t('components.wifiDialog.off') }));
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
      Alert.alert(t('components.wifiDialog.toggleFailedTitle'), t('components.wifiDialog.toggleFailedMessage', { state: nextEnabled ? t('components.wifiDialog.on') : t('components.wifiDialog.off') }));
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
      Alert.alert(t('components.wifiDialog.scanUnavailableTitle'), e?.message || t('components.wifiDialog.scanUnavailableDefault'));
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
          Alert.alert(t('components.wifiDialog.savedPasswordFailedTitle'), t('components.wifiDialog.enterPasswordAgain', { ssid }));
          return;
        }
        Alert.alert(t('components.wifiDialog.connectionFailedTitle'), t('components.wifiDialog.couldNotConnect', { ssid }));
      }
    } catch (e: any) {
      if (usedSavedPassword) {
        await clearSecureWifiPassword(ssid);
        setPasswordSsid(ssid);
        setPassword('');
        Alert.alert(t('components.wifiDialog.savedPasswordFailedTitle'), e?.message || t('components.wifiDialog.enterPasswordAgain', { ssid }));
        return;
      }
      Alert.alert(t('components.wifiDialog.connectionFailedTitle'), e?.message || t('components.wifiDialog.couldNotConnect', { ssid }));
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
        Alert.alert(t('components.wifiDialog.disconnectFailedTitle'), t('components.wifiDialog.couldNotDisconnect', { ssid: previousInfo.ssid }));
      } else {
        setTimeout(refresh, 700);
        setTimeout(refresh, 1800);
      }
    } catch (e: any) {
      setWifiInfo(previousInfo);
      Alert.alert(t('components.wifiDialog.disconnectFailedTitle'), e?.message || t('components.wifiDialog.couldNotDisconnect', { ssid: previousInfo.ssid }));
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
          <View style={styles.headerTitleRow}>
            <Icon name="wifi" size={22} color="#fff" style={styles.headerIcon} />
            <Text style={styles.headerTitle}>{t('components.wifiDialog.title')}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Icon name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Toggle row */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('components.wifiDialog.title')}</Text>
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
                <View style={styles.connectedTextRow}>
                  <Icon name="check" size={16} color="#2e7d32" style={styles.connectedCheck} />
                  <Text style={styles.connectedText} numberOfLines={1}>{t('components.wifiDialog.connected', { ssid: wifiInfo.ssid })}</Text>
                  <Icon name={signalIcon(wifiInfo.signalLevel)} size={16} color="#2e7d32" style={styles.connectedSignal} />
                </View>
                <TouchableOpacity
                  style={[styles.disconnectBtn, disconnectingWifi && styles.disconnectBtnDisabled]}
                  onPress={handleDisconnect}
                  disabled={disconnectingWifi}
                >
                  {disconnectingWifi ? (
                    <ActivityIndicator color="#2e7d32" size="small" />
                  ) : (
                    <Text style={styles.disconnectBtnText}>{t('components.wifiDialog.disconnect')}</Text>
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
                <View style={styles.scanBtnRow}>
                  <Icon name="magnify" size={18} color="#fff" style={styles.scanBtnIcon} />
                  <Text style={styles.scanBtnText}>{t('components.wifiDialog.scanForNetworks')}</Text>
                </View>
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
                      <View style={styles.networkMeta}>
                        <Icon name={item.secured ? 'lock' : 'lock-open-variant'} size={13} color="#666" style={styles.networkMetaIcon} />
                        <Icon name={signalIcon(item.signalLevel)} size={15} color="#666" />
                      </View>
                    </View>
                    {isConnecting ? (
                      <ActivityIndicator color="#2b7fff" size="small" />
                    ) : isCurrentNetwork ? (
                      <Text style={styles.connectedBadge}>{t('components.wifiDialog.connectedBadge')}</Text>
                    ) : (
                      <Text style={styles.connectArrow}>›</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                !scanning ? (
                  <Text style={styles.emptyText}>{t('components.wifiDialog.tapScanHint')}</Text>
                ) : null
              }
            />
          </>
        )}

        {!wifiInfo?.isEnabled && (
          <Text style={styles.disabledText}>{t('components.wifiDialog.disabledHint')}</Text>
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
              <Text style={styles.pwdTitle}>{t('components.wifiDialog.connectTo')}</Text>
              <Text style={styles.pwdSsid} numberOfLines={1}>{passwordSsid}</Text>

              <View style={styles.pwdInputRow}>
                <TextInput
                  style={styles.pwdInput}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder={t('components.wifiDialog.passwordPlaceholder')}
                  placeholderTextColor="#999"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Icon name={showPassword ? 'eye-off-outline' : 'eye'} size={22} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.pwdActions}>
                <TouchableOpacity
                  style={styles.pwdCancel}
                  onPress={() => setPasswordSsid(null)}
                >
                  <Text style={styles.pwdCancelText}>{t('components.wifiDialog.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pwdConnect, !password && styles.pwdConnectDisabled]}
                  onPress={() => connectTo(passwordSsid!, password, false)}
                  disabled={!password}
                >
                  <Text style={styles.pwdConnectText}>{t('components.wifiDialog.connect')}</Text>
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
    backgroundColor: '#2b7fff',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 10,
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
  connectedTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  connectedCheck: {
    marginRight: 6,
  },
  connectedSignal: {
    marginLeft: 6,
  },
  connectedText: {
    color: '#2e7d32',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
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
    backgroundColor: '#2b7fff',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanBtnDisabled: {
    backgroundColor: '#999',
  },
  scanBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanBtnIcon: {
    marginRight: 8,
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
    borderColor: '#2b7fff',
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
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  networkMetaIcon: {
    marginRight: 6,
  },
  connectedBadge: {
    fontSize: 13,
    color: '#2b7fff',
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
    borderColor: '#2b7fff',
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
    backgroundColor: '#2b7fff',
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
