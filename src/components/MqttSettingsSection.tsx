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
  PermissionsAndroid,
} from 'react-native';
import SettingsSection from './settings/SettingsSection';
import SettingsSwitch from './settings/SettingsSwitch';
import SettingsInput from './settings/SettingsInput';
import Icon from './Icon';
import { StorageService } from '../utils/storage';
import { mqttClient } from '../utils/MqttModule';
import { getSecureMqttPassword, saveSecureMqttPassword } from '../utils/secureStorage';
import { ApiService } from '../utils/ApiService';

interface MqttSettingsSectionProps {
  onSettingsChanged?: () => void;
}

export const MqttSettingsSection: React.FC<MqttSettingsSectionProps> = ({
  onSettingsChanged,
}) => {
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
  // Image publishing (screenshot / camera snapshots)
  const [screenshotEnabled, setScreenshotEnabled] = useState(false);
  const [screenshotAuto, setScreenshotAuto] = useState(false);
  const [screenshotInterval, setScreenshotInterval] = useState('60');
  const [screenshotQuality, setScreenshotQuality] = useState('70');
  const [screenshotMaxWidth, setScreenshotMaxWidth] = useState('1280');
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraAuto, setCameraAuto] = useState(false);
  const [cameraInterval, setCameraInterval] = useState('300');
  const [cameraQuality, setCameraQuality] = useState('70');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

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
      mqttScreenshotEnabled,
      mqttScreenshotAuto,
      mqttScreenshotInterval,
      mqttScreenshotQuality,
      mqttScreenshotMaxWidth,
      mqttCameraEnabled,
      mqttCameraAuto,
      mqttCameraInterval,
      mqttCameraQuality,
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
      StorageService.getMqttScreenshotEnabled(),
      StorageService.getMqttScreenshotAuto(),
      StorageService.getMqttScreenshotInterval(),
      StorageService.getMqttScreenshotQuality(),
      StorageService.getMqttScreenshotMaxWidth(),
      StorageService.getMqttCameraEnabled(),
      StorageService.getMqttCameraAuto(),
      StorageService.getMqttCameraInterval(),
      StorageService.getMqttCameraQuality(),
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
    setScreenshotEnabled(mqttScreenshotEnabled);
    setScreenshotAuto(mqttScreenshotAuto);
    setScreenshotInterval(mqttScreenshotInterval.toString());
    setScreenshotQuality(mqttScreenshotQuality.toString());
    setScreenshotMaxWidth(mqttScreenshotMaxWidth.toString());
    setCameraEnabled(mqttCameraEnabled);
    setCameraAuto(mqttCameraAuto);
    setCameraInterval(mqttCameraInterval.toString());
    setCameraQuality(mqttCameraQuality.toString());

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
            setConnectionError('Connection timed out after 15 seconds. Check broker URL, port, and network connectivity.');
            return false;
          }
          return current;
        });
      }, 15000);
    } catch (error: any) {
      console.error('[MqttSettings] Failed to connect MQTT:', error);
      setConnectionError(error.message || 'Unknown error');
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
        'Reconnect Required',
        'The Device Name change will take effect after reconnecting MQTT. Reconnect now?',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Reconnect',
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

  /**
   * Enabling or disabling an image stream changes the set of discovered entities, which is
   * only published on connect — offer to reconnect right away.
   */
  const promptReconnectForDiscovery = () => {
    if (!isConnected) return;
    Alert.alert(
      'Reconnect Required',
      'Home Assistant entities are published when connecting. Reconnect now to apply this change?',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Reconnect',
          onPress: async () => {
            await handleDisconnect();
            setTimeout(() => handleConnect(), 500);
          },
        },
      ]
    );
  };

  /**
   * Push the stored image settings to the running MQTT client so a change applies immediately
   * instead of on the next connect. No-op when MQTT is not running.
   */
  const pushImageSettings = async () => {
    try {
      await mqttClient.updateImageSettings({
        screenshotAuto: await StorageService.getMqttScreenshotAuto(),
        screenshotInterval: await StorageService.getMqttScreenshotInterval(),
        screenshotQuality: await StorageService.getMqttScreenshotQuality(),
        screenshotMaxWidth: await StorageService.getMqttScreenshotMaxWidth(),
        cameraAuto: await StorageService.getMqttCameraAuto(),
        cameraInterval: await StorageService.getMqttCameraInterval(),
        cameraQuality: await StorageService.getMqttCameraQuality(),
      });
    } catch (error) {
      console.log('[MqttSettings] Could not push image settings:', error);
    }
  };

  const handleScreenshotEnabledChange = async (value: boolean) => {
    setScreenshotEnabled(value);
    await StorageService.saveMqttScreenshotEnabled(value);
    onSettingsChanged?.();
    promptReconnectForDiscovery();
  };

  const handleScreenshotAutoChange = async (value: boolean) => {
    setScreenshotAuto(value);
    await StorageService.saveMqttScreenshotAuto(value);
    await pushImageSettings();
    onSettingsChanged?.();
  };

  const handleScreenshotIntervalChange = async (value: string) => {
    setScreenshotInterval(value);
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds) && seconds >= 5 && seconds <= 3600) {
      await StorageService.saveMqttScreenshotInterval(seconds);
      await pushImageSettings();
      onSettingsChanged?.();
    }
  };

  const handleScreenshotQualityChange = async (value: string) => {
    setScreenshotQuality(value);
    const quality = parseInt(value, 10);
    if (!isNaN(quality) && quality >= 1 && quality <= 100) {
      await StorageService.saveMqttScreenshotQuality(quality);
      await pushImageSettings();
      onSettingsChanged?.();
    }
  };

  const handleScreenshotMaxWidthChange = async (value: string) => {
    setScreenshotMaxWidth(value);
    const width = parseInt(value, 10);
    if (!isNaN(width) && width >= 0) {
      await StorageService.saveMqttScreenshotMaxWidth(width);
      await pushImageSettings();
      onSettingsChanged?.();
    }
  };

  const handleCameraEnabledChange = async (value: boolean) => {
    if (value) {
      // Snapshots are captured natively via Camera2, which needs the runtime permission
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Camera Permission Required',
            'FreeKiosk needs camera access to publish camera snapshots over MQTT.'
          );
          return;
        }
      } catch (error) {
        console.error('[MqttSettings] Camera permission request failed:', error);
        return;
      }
    }

    setCameraEnabled(value);
    await StorageService.saveMqttCameraEnabled(value);
    onSettingsChanged?.();
    promptReconnectForDiscovery();
  };

  const handleCameraAutoChange = async (value: boolean) => {
    setCameraAuto(value);
    await StorageService.saveMqttCameraAuto(value);
    await pushImageSettings();
    onSettingsChanged?.();
  };

  const handleCameraIntervalChange = async (value: string) => {
    setCameraInterval(value);
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds) && seconds >= 5 && seconds <= 3600) {
      await StorageService.saveMqttCameraInterval(seconds);
      await pushImageSettings();
      onSettingsChanged?.();
    }
  };

  const handleCameraQualityChange = async (value: string) => {
    setCameraQuality(value);
    const quality = parseInt(value, 10);
    if (!isNaN(quality) && quality >= 1 && quality <= 100) {
      await StorageService.saveMqttCameraQuality(quality);
      await pushImageSettings();
      onSettingsChanged?.();
    }
  };

  const getStatusColor = () => {
    if (isLoading) return '#FF9800';
    return isConnected ? '#4CAF50' : '#F44336';
  };

  const getStatusText = () => {
    if (isLoading) return 'Connecting...';
    return isConnected ? 'Connected' : 'Disconnected';
  };

  return (
    <SettingsSection
      title="MQTT"
      icon="lan-connect"
    >
      <SettingsSwitch
        label="Enable MQTT"
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
                    <Text style={styles.connectButtonText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : brokerUrl.trim().length > 0 ? (
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={handleConnect}
                  >
                    <Icon name="lan-connect" size={16} color="#FFF" />
                    <Text style={styles.connectButtonText}>Connect</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.connectHint}>Enter broker URL to connect</Text>
                )}
              </View>
            )}
          </View>

          {/* Broker URL */}
          <SettingsInput
            label="Broker URL"
            value={brokerUrl}
            onChangeText={handleBrokerUrlChange}
            placeholder="e.g. 192.168.1.100"
            keyboardType="url"
            icon="server-network"
            hint="MQTT broker hostname or IP address (required)"
          />

          {/* Port */}
          <SettingsInput
            label="Port"
            value={port}
            onChangeText={handlePortChange}
            placeholder="1883"
            keyboardType="numeric"
            icon="numeric"
            hint="Port 1-65535 (default: 1883)"
          />

          {/* Username */}
          <SettingsInput
            label="Username (optional)"
            value={username}
            onChangeText={handleUsernameChange}
            placeholder="Leave empty if not required"
            icon="account"
          />

          {/* Password */}
          <SettingsInput
            label="Password (optional)"
            value={password}
            onChangeText={handlePasswordChange}
            placeholder="Leave empty if not required"
            secureTextEntry
            icon="lock"
            hint={password.length > 0 ? "Password is saved. Leave untouched to keep current password." : undefined}
          />

          {/* Client ID */}
          <SettingsInput
            label="Client ID (optional)"
            value={clientId}
            onChangeText={handleClientIdChange}
            placeholder="Auto-generated if empty"
            icon="identifier"
          />

          {/* Device Name */}
          <SettingsInput
            label="Device Name (optional)"
            value={deviceName}
            onChangeText={handleDeviceNameChange}
            onFocus={handleDeviceNameFocus}
            onBlur={handleDeviceNameBlur}
            placeholder="e.g. lobby, entrance, kitchen"
            icon="rename-box"
            hint="Friendly name used in MQTT topics and HA device name. If empty, uses Android ID."
          />

          {/* Base Topic */}
          <SettingsInput
            label="Base Topic"
            value={baseTopic}
            onChangeText={handleBaseTopicChange}
            placeholder="freekiosk"
            icon="tag"
            hint="Base MQTT topic for this device"
          />

          {/* Discovery Prefix */}
          <SettingsInput
            label="Discovery Prefix"
            value={discoveryPrefix}
            onChangeText={handleDiscoveryPrefixChange}
            placeholder="homeassistant"
            icon="home-search"
            hint="Home Assistant MQTT discovery prefix"
          />

          {/* Status Interval */}
          <SettingsInput
            label="Status Interval (seconds)"
            value={statusInterval}
            onChangeText={handleStatusIntervalChange}
            placeholder="30"
            keyboardType="numeric"
            icon="timer-outline"
            hint="How often to publish status (5-3600 seconds)"
          />

          {/* Allow Remote Control */}
          <SettingsSwitch
            label="Allow Remote Control"
            value={allowControl}
            onValueChange={handleAllowControlChange}
            icon="remote"
            hint="Enable commands via MQTT (brightness, reload, etc.)"
          />

          {/* Always-on Motion Detection */}
          <SettingsSwitch
            label="Always-on Motion Detection"
            value={motionAlwaysOn}
            onValueChange={handleMotionAlwaysOnChange}
            icon="motion-sensor"
            hint="Run camera-based motion detection continuously (higher battery usage). Without this, motion is only detected during screensaver."
          />

          {/* Screenshot publishing */}
          <SettingsSwitch
            label="Publish Screenshot"
            value={screenshotEnabled}
            onValueChange={handleScreenshotEnabledChange}
            icon="monitor-screenshot"
            hint="Expose the kiosk screen in Home Assistant as an image/camera entity, with a capture button."
          />

          {screenshotEnabled && (
            <>
              <SettingsSwitch
                label="Screenshot Auto-publish"
                value={screenshotAuto}
                onValueChange={handleScreenshotAutoChange}
                icon="image-refresh"
                hint="Publish a screenshot periodically. Can also be toggled from Home Assistant."
              />

              <SettingsInput
                label="Screenshot Interval (seconds)"
                value={screenshotInterval}
                onChangeText={handleScreenshotIntervalChange}
                placeholder="60"
                keyboardType="numeric"
                icon="timer-outline"
                hint="5-3600 seconds (only used when auto-publish is on)"
              />

              <SettingsInput
                label="Screenshot JPEG Quality"
                value={screenshotQuality}
                onChangeText={handleScreenshotQualityChange}
                placeholder="70"
                keyboardType="numeric"
                icon="quality-high"
                hint="1-100. Lower values mean smaller MQTT messages."
              />

              <SettingsInput
                label="Screenshot Max Width (px)"
                value={screenshotMaxWidth}
                onChangeText={handleScreenshotMaxWidthChange}
                placeholder="1280"
                keyboardType="numeric"
                icon="arrow-expand-horizontal"
                hint="Downscale before publishing. 0 keeps the native resolution."
              />
            </>
          )}

          {/* Camera publishing */}
          <SettingsSwitch
            label="Publish Camera Snapshots"
            value={cameraEnabled}
            onValueChange={handleCameraEnabledChange}
            icon="camera"
            hint="Expose each device camera in Home Assistant as an image/camera entity. Snapshots fail while motion detection is using the camera."
          />

          {cameraEnabled && (
            <>
              <SettingsSwitch
                label="Camera Auto-publish"
                value={cameraAuto}
                onValueChange={handleCameraAutoChange}
                icon="camera-retake"
                hint="Publish a snapshot periodically (higher battery usage). Can also be toggled from Home Assistant."
              />

              <SettingsInput
                label="Camera Interval (seconds)"
                value={cameraInterval}
                onChangeText={handleCameraIntervalChange}
                placeholder="300"
                keyboardType="numeric"
                icon="timer-outline"
                hint="5-3600 seconds (only used when auto-publish is on)"
              />

              <SettingsInput
                label="Camera JPEG Quality"
                value={cameraQuality}
                onChangeText={handleCameraQualityChange}
                placeholder="70"
                keyboardType="numeric"
                icon="quality-high"
                hint="1-100. Lower values mean smaller MQTT messages."
              />
            </>
          )}

          {/* Home Assistant Info Box */}
          <View style={styles.hintContainer}>
            <Icon name="home-assistant" size={20} color="#41BDF5" />
            <Text style={styles.hintText}>
              Devices auto-discover in Home Assistant via MQTT Discovery. Ensure your HA MQTT integration is configured.
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
    color: '#1565C0',
    lineHeight: 18,
  },
});
