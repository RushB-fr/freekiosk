/**
 * ApiSettingsSection.tsx
 * Settings section for REST API / Home Assistant integration
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { httpServer } from '../utils/HttpServerModule';

interface ApiSettingsSectionProps {
  onSettingsChanged?: () => void;
}

export const ApiSettingsSection: React.FC<ApiSettingsSectionProps> = ({
  onSettingsChanged,
}) => {
  const [apiEnabled, setApiEnabled] = useState(false);
  const [apiPort, setApiPort] = useState('8080');
  const [apiKey, setApiKey] = useState('');
  const [allowControl, setAllowControl] = useState(true);
  const [serverRunning, setServerRunning] = useState(false);
  const [localIp, setLocalIp] = useState('0.0.0.0');
  const [isLoading, setIsLoading] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Check server status periodically
  useEffect(() => {
    const checkStatus = async () => {
      const running = await httpServer.isRunning();
      setServerRunning(running);
      if (running) {
        const info = await httpServer.getServerInfo();
        setLocalIp(info.ip);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    const [enabled, port, key, control] = await Promise.all([
      StorageService.getRestApiEnabled(),
      StorageService.getRestApiPort(),
      StorageService.getRestApiKey(),
      StorageService.getRestApiAllowControl(),
    ]);

    setApiEnabled(enabled);
    setApiPort(port.toString());
    setApiKey(key);
    setAllowControl(control);

    // Check if server is already running (started by KioskScreen)
    const isRunning = await httpServer.isRunning();
    if (isRunning) {
      setServerRunning(true);
      const info = await httpServer.getServerInfo();
      if (info.ip) {
        setLocalIp(info.ip);
      }
    } else if (enabled) {
      // Only start if enabled and not already running
      startServer(port, key, control);
    }
  };

  const startServer = async (port: number, key: string, control: boolean) => {
    setIsLoading(true);
    try {
      const result = await httpServer.startServer(port, key || null, control);
      setServerRunning(true);
      setLocalIp(result.ip);
    } catch (error: any) {
      console.error('Failed to start server:', error);
      Alert.alert('Error', `Failed to start API server: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopServer = async () => {
    setIsLoading(true);
    try {
      await httpServer.stopServer();
      setServerRunning(false);
    } catch (error: any) {
      console.error('Failed to stop server:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApiEnabledChange = async (enabled: boolean) => {
    setApiEnabled(enabled);
    await StorageService.saveRestApiEnabled(enabled);

    if (enabled) {
      const port = parseInt(apiPort, 10) || 8080;
      await startServer(port, apiKey, allowControl);
    } else {
      await stopServer();
    }

    onSettingsChanged?.();
  };

  const handlePortChange = async (value: string) => {
    setApiPort(value);
    const port = parseInt(value, 10);
    if (!isNaN(port) && port >= 1024 && port <= 65535) {
      await StorageService.saveRestApiPort(port);
      
      // Restart server if running
      if (serverRunning) {
        await stopServer();
        await startServer(port, apiKey, allowControl);
      }
      
      onSettingsChanged?.();
    }
  };

  const handleApiKeyChange = async (value: string) => {
    setApiKey(value);
    await StorageService.saveRestApiKey(value);
    
    // Restart server if running
    if (serverRunning) {
      const port = parseInt(apiPort, 10) || 8080;
      await stopServer();
      await startServer(port, value, allowControl);
    }
    
    onSettingsChanged?.();
  };

  const handleAllowControlChange = async (value: boolean) => {
    setAllowControl(value);
    await StorageService.saveRestApiAllowControl(value);
    
    // Restart server if running
    if (serverRunning) {
      const port = parseInt(apiPort, 10) || 8080;
      await stopServer();
      await startServer(port, apiKey, value);
    }
    
    onSettingsChanged?.();
  };

  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    handleApiKeyChange(key);
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  const getApiUrl = () => {
    const port = parseInt(apiPort, 10) || 8080;
    return `http://${localIp}:${port}`;
  };

  return (
    <SettingsSection
      title="REST API"
      icon="api"
    >
      <SettingsSwitch
        label="Enable REST API"
        value={apiEnabled}
        onValueChange={handleApiEnabledChange}
        icon="server-network"
      />

      {apiEnabled && (
        <>
          {/* Server Status */}
          <View style={styles.statusContainer}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusIndicator,
                { backgroundColor: serverRunning ? '#4CAF50' : '#F44336' }
              ]} />
              <Text style={styles.statusText}>
                {isLoading ? 'Starting...' : serverRunning ? 'Server Running' : 'Server Stopped'}
              </Text>
              {isLoading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
            </View>

            {serverRunning && (
              <TouchableOpacity
                style={styles.urlContainer}
                onPress={() => copyToClipboard(getApiUrl(), 'API URL')}
              >
                <Icon name="link" size={16} color="#007AFF" />
                <Text style={styles.urlText}>{getApiUrl()}</Text>
                <Icon name="content-copy" size={16} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          {/* Port Setting */}
          <SettingsInput
            label="Port"
            value={apiPort}
            onChangeText={handlePortChange}
            placeholder="8080"
            keyboardType="numeric"
            icon="numeric"
            hint="Port 1024-65535 (default: 8080)"
          />

          {/* API Key */}
          <View style={styles.apiKeyContainer}>
            <SettingsInput
              label="API Key (optional)"
              value={apiKey}
              onChangeText={handleApiKeyChange}
              placeholder="Leave empty for no authentication"
              secureTextEntry
              icon="key-variant"
              hint="Used as X-Api-Key header"
            />
            <View style={styles.apiKeyButtons}>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={generateApiKey}
              >
                <Icon name="refresh" size={16} color="#007AFF" />
                <Text style={styles.smallButtonText}>Generate</Text>
              </TouchableOpacity>
              {apiKey ? (
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => copyToClipboard(apiKey, 'API Key')}
                >
                  <Icon name="content-copy" size={16} color="#007AFF" />
                  <Text style={styles.smallButtonText}>Copy</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Allow Control */}
          <SettingsSwitch
            label="Allow Remote Control"
            value={allowControl}
            onValueChange={handleAllowControlChange}
            icon="remote"
            hint="Enable POST commands (brightness, reload, etc.)"
          />

          {/* API Endpoints Info */}
          <View style={styles.endpointsContainer}>
            <Text style={styles.endpointsTitle}>Available Endpoints:</Text>
            
            <View style={styles.endpointCategory}>
              <Text style={styles.categoryLabel}>GET (Read-only)</Text>
              <Text style={styles.endpoint}>/api/status - Full device status</Text>
              <Text style={styles.endpoint}>/api/battery - Battery info</Text>
              <Text style={styles.endpoint}>/api/brightness - Current brightness</Text>
              <Text style={styles.endpoint}>/api/screen - Screen state</Text>
              <Text style={styles.endpoint}>/api/info - Device info</Text>
              <Text style={styles.endpoint}>/api/health - Health check</Text>
              <Text style={styles.endpoint}>/api/sensors - Light, proximity, accelerometer</Text>
              <Text style={styles.endpoint}>/api/storage - Storage info</Text>
              <Text style={styles.endpoint}>/api/memory - RAM info</Text>
              <Text style={styles.endpoint}>/api/wifi - WiFi status</Text>
              <Text style={styles.endpoint}>/api/screenshot - Capture screen (PNG)</Text>
            </View>

            {allowControl && (
              <View style={styles.endpointCategory}>
                <Text style={styles.categoryLabel}>POST (Control)</Text>
                <Text style={styles.endpoint}>/api/brightness - Set brightness</Text>
                <Text style={styles.endpoint}>/api/screen/on - Turn screen on</Text>
                <Text style={styles.endpoint}>/api/screen/off - Turn screen off</Text>
                <Text style={styles.endpoint}>/api/screensaver/on - Enable screensaver</Text>
                <Text style={styles.endpoint}>/api/screensaver/off - Disable screensaver</Text>
                <Text style={styles.endpoint}>/api/reload - Reload WebView</Text>
                <Text style={styles.endpoint}>/api/url - Navigate to URL</Text>
                <Text style={styles.endpoint}>/api/wake - Wake from screensaver</Text>
                <Text style={styles.endpoint}>/api/tts - Text to speech</Text>
                <Text style={styles.endpoint}>/api/volume - Set volume</Text>
                <Text style={styles.endpoint}>/api/toast - Show toast message</Text>
                <Text style={styles.endpoint}>/api/js - Execute JavaScript</Text>
                <Text style={styles.endpoint}>/api/clearCache - Clear WebView cache</Text>
                <Text style={styles.endpoint}>/api/app/launch - Launch external app</Text>
                <Text style={styles.endpoint}>/api/reboot - Reboot (Device Owner)</Text>
                <Text style={styles.endpoint}>/api/audio/play - Play audio URL</Text>
                <Text style={styles.endpoint}>/api/audio/stop - Stop audio</Text>
                <Text style={styles.endpoint}>/api/audio/beep - Play beep sound</Text>
              </View>
            )}

            {allowControl && (
              <View style={styles.endpointCategory}>
                <Text style={styles.categoryLabel}>POST (Remote Control - Android TV)</Text>
                <Text style={styles.endpoint}>/api/remote/up - D-pad up</Text>
                <Text style={styles.endpoint}>/api/remote/down - D-pad down</Text>
                <Text style={styles.endpoint}>/api/remote/left - D-pad left</Text>
                <Text style={styles.endpoint}>/api/remote/right - D-pad right</Text>
                <Text style={styles.endpoint}>/api/remote/select - Select/Enter</Text>
                <Text style={styles.endpoint}>/api/remote/back - Back button</Text>
                <Text style={styles.endpoint}>/api/remote/home - Home button</Text>
                <Text style={styles.endpoint}>/api/remote/menu - Menu button</Text>
                <Text style={styles.endpoint}>/api/remote/playpause - Play/Pause</Text>
              </View>
            )}
          </View>

          {/* Home Assistant Hint */}
          <View style={styles.hintContainer}>
            <Icon name="home-assistant" size={20} color="#41BDF5" />
            <Text style={styles.hintText}>
              Use with Home Assistant's RESTful integration. See documentation for configuration examples.
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
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  urlText: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 14,
    color: '#007AFF',
    fontFamily: 'monospace',
  },
  apiKeyContainer: {
    marginBottom: 8,
  },
  apiKeyButtons: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
  },
  smallButtonText: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 4,
  },
  endpointsContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  endpointsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  endpointCategory: {
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  endpoint: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'monospace',
    paddingVertical: 2,
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
