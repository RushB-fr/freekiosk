/**
 * MqttSettingsSection.tsx
 * Settings section for MQTT / Home Assistant integration
 */

import React, { useState, useEffect } from 'react';
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
  const [motionAlwaysOn, setMotionAlwaysOn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
  };

  const restartIfConnected = async () => {
    if (isConnected || mqttEnabled) {
      try {
        await mqttClient.stop();
        await ApiService.autoStartMqtt();
      } catch (error: any) {
        console.error('[MqttSettings] Error restarting MQTT:', error);
      }
    }
  };

  const handleMqttEnabledChange = async (enabled: boolean) => {
    setMqttEnabled(enabled);
    await StorageService.saveMqttEnabled(enabled);

    if (enabled) {
      setIsLoading(true);
      try {
        await ApiService.autoStartMqtt();
      } catch (error: any) {
        console.error('[MqttSettings] Failed to start MQTT:', error);
        Alert.alert('Error', `Failed to start MQTT: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    } else {
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
    await restartIfConnected();
    onSettingsChanged?.();
  };

  const handlePortChange = async (value: string) => {
    setPort(value);
    const portNum = parseInt(value, 10);
    if (!isNaN(portNum) && portNum >= 1 && portNum <= 65535) {
      await StorageService.saveMqttPort(portNum);
      await restartIfConnected();
      onSettingsChanged?.();
    }
  };

  const handleUsernameChange = async (value: string) => {
    setUsername(value);
    await StorageService.saveMqttUsername(value);
    await restartIfConnected();
    onSettingsChanged?.();
  };

  const handlePasswordChange = async (value: string) => {
    setPassword(value);
    await saveSecureMqttPassword(value);
    await restartIfConnected();
    onSettingsChanged?.();
  };

  const handleClientIdChange = async (value: string) => {
    setClientId(value);
    await StorageService.saveMqttClientId(value);
    await restartIfConnected();
    onSettingsChanged?.();
  };

  const handleBaseTopicChange = async (value: string) => {
    setBaseTopic(value);
    await StorageService.saveMqttBaseTopic(value);
    await restartIfConnected();
    onSettingsChanged?.();
  };

  const handleDiscoveryPrefixChange = async (value: string) => {
    setDiscoveryPrefix(value);
    await StorageService.saveMqttDiscoveryPrefix(value);
    await restartIfConnected();
    onSettingsChanged?.();
  };

  const handleStatusIntervalChange = async (value: string) => {
    setStatusInterval(value);
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds) && seconds >= 5 && seconds <= 3600) {
      await StorageService.saveMqttStatusInterval(seconds);
      await restartIfConnected();
      onSettingsChanged?.();
    }
  };

  const handleAllowControlChange = async (value: boolean) => {
    setAllowControl(value);
    await StorageService.saveMqttAllowControl(value);
    await restartIfConnected();
    onSettingsChanged?.();
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
          {/* Connection Status */}
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
          </View>

          {/* Broker URL */}
          <SettingsInput
            label="Broker URL"
            value={brokerUrl}
            onChangeText={handleBrokerUrlChange}
            placeholder="e.g. 192.168.1.100"
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
          />

          {/* Client ID */}
          <SettingsInput
            label="Client ID (optional)"
            value={clientId}
            onChangeText={handleClientIdChange}
            placeholder="Auto-generated if empty"
            icon="identifier"
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
