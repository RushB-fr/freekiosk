/**
 * MqttSettingsSection.tsx
 * Settings section for MQTT / Home Assistant integration
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import SettingsSection from './settings/SettingsSection';
import SettingsSwitch from './settings/SettingsSwitch';
import SettingsInput from './settings/SettingsInput';
import Icon from './Icon';
import { StorageService } from '../utils/storage';
import { mqttClient } from '../utils/MqttModule';
import { getSecureMqttPassword, saveSecureMqttPassword } from '../utils/secureStorage';
import { ApiService } from '../utils/ApiService';
import KioskModule from '../utils/KioskModule';
import { useTranslation } from 'react-i18next';

interface MqttSettingsSectionProps {
  onSettingsChanged?: () => void;
}

export const MqttSettingsSection: React.FC<MqttSettingsSectionProps> = ({
  onSettingsChanged,
}) => {
  const { t } = useTranslation();
  const [mqttEnabled, setMqttEnabled] = useState(false);
  const [brokerUrl, setBrokerUrl] = useState('');
  const [port, setPort] = useState('1883');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [clientId, setClientId] = useState('');
  const [baseTopic, setBaseTopic] = useState('freekiosk');
  const [discoveryPrefix, setDiscoveryPrefix] = useState('homeassistant');
  const [statusInterval, setStatusInterval] = useState('30');
  const [allowControl, setAllowControl] = useState(true);
  const [deviceName, setDeviceName] = useState('');
  const [motionAlwaysOn, setMotionAlwaysOn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // #234: null while unknown, false when Android may doze the app off the broker.
  const [batteryExempt, setBatteryExempt] = useState<boolean | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    checkBatteryExemption();
  }, []);

  // #234: Doze defers MQTT's network once the device is idle, despite the wake lock the
  // client holds, and the broker then drops it (unavailable in Home Assistant after a
  // couple of hours). The exemption is the only reliable fix, so surface its state.
  const checkBatteryExemption = async () => {
    try {
      setBatteryExempt(await KioskModule.isIgnoringBatteryOptimizations());
    } catch {
      setBatteryExempt(null);
    }
  };

  const handleRequestBatteryExemption = async () => {
    try {
      await KioskModule.requestIgnoreBatteryOptimizations();
    } catch (error) {
      console.warn('[MqttSettings] Battery exemption request failed:', error);
    }
    // The system dialog is a separate activity, so re-check when we come back. Lock task
    // no longer blocks it: KioskModule whitelists the dialog for the few seconds it is up.
    setTimeout(checkBatteryExemption, 1000);
  };

  // Check connection status periodically
  useEffect(() => {
    const checkStatus = async () => {
      const connected = await mqttClient.isConnected();
      setIsConnected(connected);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Listen for connection changes
  useEffect(() => {
    const unsubscribe = mqttClient.onConnectionChanged((connected) => {
      setIsConnected(connected);
      setIsLoading(false);
      if (connected) {
        setConnectionError(null);
      }
      // Clear connection timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
    });

    return () => {
      unsubscribe();
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  // Listen for connection errors from native
  useEffect(() => {
    const unsubscribe = mqttClient.onConnectionError((message) => {
      setConnectionError(message);
    });
    return unsubscribe;
  }, []);

  const loadSettings = async () => {
    const [
      enabled,
      broker,
      mqttPort,
      user,
      mqttClientId,
      topic,
      prefix,
      interval,
      control,
      mqttDeviceName,
      mqttPassword,
      mqttMotionAlwaysOn,
    ] = await Promise.all([
      StorageService.getMqttEnabled(),
      StorageService.getMqttBrokerUrl(),
      StorageService.getMqttPort(),
      StorageService.getMqttUsername(),
      StorageService.getMqttClientId(),
      StorageService.getMqttBaseTopic(),
      StorageService.getMqttDiscoveryPrefix(),
      StorageService.getMqttStatusInterval(),
      StorageService.getMqttAllowControl(),
      StorageService.getMqttDeviceName(),
      getSecureMqttPassword(),
      StorageService.getMqttMotionAlwaysOn(),
    ]);

    setMqttEnabled(enabled);
    setBrokerUrl(broker);
    setPort(mqttPort.toString());
    setUsername(user);
    setClientId(mqttClientId);
    setBaseTopic(topic);
    setDiscoveryPrefix(prefix);
    setStatusInterval(interval.toString());
    setAllowControl(control);
    setPassword(mqttPassword);
    setMotionAlwaysOn(mqttMotionAlwaysOn);

    // Pre-fill Device Name with Android model if never set
    if (!mqttDeviceName) {
      try {
        const model = await mqttClient.getDeviceModel();
        if (model) {
          setDeviceName(model);
          await StorageService.saveMqttDeviceName(model);
        }
      } catch (e) {
        console.log('[MqttSettings] Could not get device model for pre-fill:', e);
      }
    } else {
      setDeviceName(mqttDeviceName);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setConnectionError(null);
    try {
      // Stop existing client first to avoid ALREADY_RUNNING error
      await ApiService.stopMqtt();
      await ApiService.autoStartMqtt();

      // Set a timeout — if no connection event within 15s, stop loading
      connectionTimeoutRef.current = setTimeout(() => {
        setIsLoading((current) => {
          if (current) {
            setConnectionError(t('components.mqtt.timeoutError'));
            return false;
          }
          return current;
        });
      }, 15000);
    } catch (error: any) {
      console.error('[MqttSettings] Failed to connect MQTT:', error);
      setConnectionError(error.message || t('components.mqtt.unknownError'));
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await ApiService.stopMqtt();
      setIsConnected(false);
    } catch (error: any) {
      console.error('[MqttSettings] Failed to disconnect MQTT:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMqttEnabledChange = async (enabled: boolean) => {
    setMqttEnabled(enabled);
    await StorageService.saveMqttEnabled(enabled);

    // #234: ask for the Doze exemption at the moment the user turns MQTT on, which is the
    // only point where the system dialog is expected. Best-effort, and a no-op when the
    // exemption is already granted.
    if (enabled) {
      KioskModule.requestIgnoreBatteryOptimizations()
        .catch(() => {/* best-effort */})
        .finally(() => setTimeout(checkBatteryExemption, 1000));
    }

    if (!enabled && isConnected) {
      setIsLoading(true);
      try {
        await ApiService.stopMqtt();
        setIsConnected(false);
      } catch (error: any) {
        console.error('[MqttSettings] Failed to stop MQTT:', error);
      } finally {
        setIsLoading(false);
      }
    }

    onSettingsChanged?.();
  };

  const handleBrokerUrlChange = async (value: string) => {
    setBrokerUrl(value);
    await StorageService.saveMqttBrokerUrl(value);
    onSettingsChanged?.();
  };

  const handlePortChange = async (value: string) => {
    setPort(value);
    const portNum = parseInt(value, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      await StorageService.saveMqttPort(portNum);
      onSettingsChanged?.();
    }
  };

  const handleUsernameChange = async (value: string) => {
    setUsername(value);
    await StorageService.saveMqttUsername(value);
    onSettingsChanged?.();
  };

  const handlePasswordChange = async (value: string) => {
    setPassword(value);
    await saveSecureMqttPassword(value);
    onSettingsChanged?.();
  };

  const handleClientIdChange = async (value: string) => {
    setClientId(value);
    await StorageService.saveMqttClientId(value);
    onSettingsChanged?.();
  };

  const handleBaseTopicChange = async (value: string) => {
    setBaseTopic(value);
    await StorageService.saveMqttBaseTopic(value);
    onSettingsChanged?.();
  };

  const handleDiscoveryPrefixChange = async (value: string) => {
    setDiscoveryPrefix(value);
    await StorageService.saveMqttDiscoveryPrefix(value);
    onSettingsChanged?.();
  };

  const handleStatusIntervalChange = async (value: string) => {
    setStatusInterval(value);
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds) && seconds >= 5 && seconds <= 3600) {
      await StorageService.saveMqttStatusInterval(seconds);
      onSettingsChanged?.();
    }
  };

  const handleAllowControlChange = async (value: boolean) => {
    setAllowControl(value);
    await StorageService.saveMqttAllowControl(value);
    onSettingsChanged?.();
  };

  const deviceNameBeforeEditRef = useRef(deviceName);

  const handleDeviceNameChange = async (value: string) => {
    setDeviceName(value);
    await StorageService.saveMqttDeviceName(value);
    onSettingsChanged?.();
  };

  const handleDeviceNameFocus = () => {
    deviceNameBeforeEditRef.current = deviceName;
  };

  const handleDeviceNameBlur = () => {
    // Only prompt reconnect if the name actually changed and MQTT is connected
    if (isConnected && deviceName !== deviceNameBeforeEditRef.current) {
      Alert.alert(
        t('components.mqtt.reconnectRequiredTitle'),
        t('components.mqtt.reconnectRequiredMessage'),
        [
          { text: t('components.mqtt.later'), style: 'cancel' },
          {
            text: t('components.mqtt.reconnect'),
            onPress: async () => {
              await handleDisconnect();
              setTimeout(() => handleConnect(), 500);
            },
          },
        ]
      );
    }
    deviceNameBeforeEditRef.current = deviceName;
  };

  const handleMotionAlwaysOnChange = async (value: boolean) => {
    setMotionAlwaysOn(value);
    await StorageService.saveMqttMotionAlwaysOn(value);
    onSettingsChanged?.();
  };

  const getStatusColor = () => {
    if (isLoading) return '#FF9800';
    return isConnected ? '#4CAF50' : '#F44336';
  };

  const getStatusText = () => {
    if (isLoading) return t('components.mqtt.connecting');
    return isConnected ? t('components.mqtt.connected') : t('components.mqtt.disconnected');
  };

  return (
    <SettingsSection
      title={t('components.mqtt.title')}
      icon="lan-connect"
    >
      <SettingsSwitch
        label={t('components.mqtt.enable')}
        value={mqttEnabled}
        onValueChange={handleMqttEnabledChange}
        icon="lan-connect"
      />

      {mqttEnabled && (
        <>
          {/* Connection Status + Connect/Disconnect Button */}
          <View style={styles.statusContainer}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusIndicator,
                { backgroundColor: getStatusColor() }
              ]} />
              <Text style={styles.statusText}>
                {getStatusText()}
              </Text>
              {isLoading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
            </View>

            {connectionError && (
              <Text style={styles.errorText}>{connectionError}</Text>
            )}

            {/* Connect / Disconnect button */}
            {!isLoading && (
              <View style={styles.connectButtonRow}>
                {isConnected ? (
                  <TouchableOpacity
                    style={[styles.connectButton, styles.disconnectButton]}
                    onPress={handleDisconnect}
                  >
                    <Icon name="lan-disconnect" size={16} color="#FFF" />
                    <Text style={styles.connectButtonText}>{t('components.mqtt.disconnect')}</Text>
                  </TouchableOpacity>
                ) : brokerUrl.trim().length > 0 ? (
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={handleConnect}
                  >
                    <Icon name="lan-connect" size={16} color="#FFF" />
                    <Text style={styles.connectButtonText}>{t('components.mqtt.connect')}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.connectHint}>{t('components.mqtt.enterBrokerUrl')}</Text>
                )}
              </View>
            )}
          </View>

          {/* #234: Doze warning */}
          {batteryExempt === false && (
            <View style={styles.dozeWarning}>
              <View style={styles.dozeHeader}>
                <Icon name="power-sleep" size={18} color="#E65100" />
                <Text style={styles.dozeTitle}>{t('components.mqtt.dozeTitle')}</Text>
              </View>
              <Text style={styles.dozeText}>
                {t('components.mqtt.dozeText')}
              </Text>
              <TouchableOpacity style={styles.dozeButton} onPress={handleRequestBatteryExemption}>
                <Icon name="shield-check" size={16} color="#FFF" />
                <Text style={styles.connectButtonText}>{t('components.mqtt.dozeExempt')}</Text>
              </TouchableOpacity>
              <Text style={styles.dozeText}>
                {t('components.mqtt.dozeAdbHint')}
              </Text>
              <Text style={styles.dozeCommand}>
                adb shell dumpsys deviceidle whitelist +com.freekiosk
              </Text>
            </View>
          )}

          {/* Broker URL */}
          <SettingsInput
            label={t('components.mqtt.brokerUrl')}
            value={brokerUrl}
            onChangeText={handleBrokerUrlChange}
            placeholder="e.g. 192.168.1.100"
            keyboardType="url"
            icon="server-network"
            hint={t('components.mqtt.brokerUrlHint')}
          />

          {/* Port */}
          <SettingsInput
            label={t('components.mqtt.port')}
            value={port}
            onChangeText={handlePortChange}
            placeholder="1883"
            keyboardType="numeric"
            icon="numeric"
            hint={t('components.mqtt.portHint')}
          />

          {/* Username */}
          <SettingsInput
            label={t('components.mqtt.username')}
            value={username}
            onChangeText={handleUsernameChange}
            placeholder={t('components.mqtt.leaveEmptyIfNotRequired')}
            icon="account"
          />

          {/* Password */}
          <SettingsInput
            label={t('components.mqtt.password')}
            value={password}
            onChangeText={handlePasswordChange}
            placeholder={t('components.mqtt.leaveEmptyIfNotRequired')}
            secureTextEntry
            icon="lock"
            hint={password.length > 0 ? t('components.mqtt.passwordSavedHint') : undefined}
          />

          {/* Client ID */}
          <SettingsInput
            label={t('components.mqtt.clientId')}
            value={clientId}
            onChangeText={handleClientIdChange}
            placeholder={t('components.mqtt.autoGeneratedIfEmpty')}
            icon="identifier"
          />

          {/* Device Name */}
          <SettingsInput
            label={t('components.mqtt.deviceName')}
            value={deviceName}
            onChangeText={handleDeviceNameChange}
            onFocus={handleDeviceNameFocus}
            onBlur={handleDeviceNameBlur}
            placeholder={t('components.mqtt.deviceNamePlaceholder')}
            icon="rename-box"
            hint={t('components.mqtt.deviceNameHint')}
          />

          {/* Base Topic */}
          <SettingsInput
            label={t('components.mqtt.baseTopic')}
            value={baseTopic}
            onChangeText={handleBaseTopicChange}
            placeholder="freekiosk"
            icon="tag"
            hint={t('components.mqtt.baseTopicHint')}
          />

          {/* Discovery Prefix */}
          <SettingsInput
            label={t('components.mqtt.discoveryPrefix')}
            value={discoveryPrefix}
            onChangeText={handleDiscoveryPrefixChange}
            placeholder="homeassistant"
            icon="home-search"
            hint={t('components.mqtt.discoveryPrefixHint')}
          />

          {/* Status Interval */}
          <SettingsInput
            label={t('components.mqtt.statusInterval')}
            value={statusInterval}
            onChangeText={handleStatusIntervalChange}
            placeholder="30"
            keyboardType="numeric"
            icon="timer-outline"
            hint={t('components.mqtt.statusIntervalHint')}
          />

          {/* Allow Remote Control */}
          <SettingsSwitch
            label={t('components.mqtt.allowControl')}
            value={allowControl}
            onValueChange={handleAllowControlChange}
            icon="remote"
            hint={t('components.mqtt.allowControlHint')}
          />

          {/* Always-on Motion Detection */}
          <SettingsSwitch
            label={t('components.mqtt.motionAlwaysOn')}
            value={motionAlwaysOn}
            onValueChange={handleMotionAlwaysOnChange}
            icon="motion-sensor"
            hint={t('components.mqtt.motionAlwaysOnHint')}
          />

          {/* Home Assistant Info Box */}
          <View style={styles.hintContainer}>
            <Icon name="home-assistant" size={20} color="#41BDF5" />
            <Text style={styles.hintText}>
              {t('components.mqtt.haInfo')}
            </Text>
          </View>
        </>
      )}
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
  statusContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  loader: {
    marginLeft: 8,
  },
  connectButtonRow: {
    marginTop: 10,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  disconnectButton: {
    backgroundColor: '#F44336',
  },
  connectButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  connectHint: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  dozeWarning: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  dozeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dozeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
  },
  dozeText: {
    fontSize: 13,
    color: '#5D4037',
    marginTop: 6,
  },
  dozeCommand: {
    fontSize: 12,
    color: '#5D4037',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  dozeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E65100',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  errorText: {
    fontSize: 13,
    color: '#F44336',
    marginTop: 8,
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  hintText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#1e63d6',
    lineHeight: 18,
  },
});
