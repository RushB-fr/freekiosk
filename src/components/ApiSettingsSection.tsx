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
import { useTranslation } from 'react-i18next';

interface ApiSettingsSectionProps {
  onSettingsChanged?: () => void;
}

export const ApiSettingsSection: React.FC<ApiSettingsSectionProps> = ({
  onSettingsChanged,
}) => {
  const { t } = useTranslation();
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

    // Always sync server state with stored settings.
    // If the server is already running (started by KioskScreen) but with a stale config
    // (e.g. a previously-set API key that was later cleared), restart it so that the
    // running server always reflects what is shown in the settings UI.
    const isRunning = await httpServer.isRunning();
    if (enabled) {
      if (isRunning) {
        // Stop the potentially-stale instance, then start fresh with current settings.
        try { await httpServer.stopServer(); } catch (_) { /* ignore */ }
      }
      startServer(port, key, control);
    } else if (isRunning) {
      // API was disabled while server was left running – stop it.
      await stopServer();
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
      Alert.alert(t('components.apiSettings.error'), t('components.apiSettings.startFailed', { message: error.message }));
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
      
      // Restart server if it is actually running (avoid stale React state)
      const isCurrentlyRunning = await httpServer.isRunning();
      if (isCurrentlyRunning) {
        await stopServer();
        await startServer(port, apiKey, allowControl);
      }
      
      onSettingsChanged?.();
    }
  };

  const handleApiKeyChange = async (value: string) => {
    setApiKey(value);
    await StorageService.saveRestApiKey(value);
    
    // Restart server if it is actually running (avoid stale React state)
    const isCurrentlyRunning = await httpServer.isRunning();
    if (isCurrentlyRunning) {
      const port = parseInt(apiPort, 10) || 8080;
      await stopServer();
      await startServer(port, value, allowControl);
    }
    
    onSettingsChanged?.();
  };

  const handleAllowControlChange = async (value: boolean) => {
    setAllowControl(value);
    await StorageService.saveRestApiAllowControl(value);
    
    // Restart server if it is actually running (avoid stale React state)
    const isCurrentlyRunning = await httpServer.isRunning();
    if (isCurrentlyRunning) {
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
    Alert.alert(t('components.apiSettings.copied'), t('components.apiSettings.copiedMessage', { label }));
  };

  const getApiUrl = () => {
    const port = parseInt(apiPort, 10) || 8080;
    return `http://${localIp}:${port}`;
  };

  return (
    <SettingsSection
      title={t('components.apiSettings.title')}
      icon="api"
    >
      <SettingsSwitch
        label={t('components.apiSettings.enable')}
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
                {isLoading ? t('components.apiSettings.starting') : serverRunning ? t('components.apiSettings.serverRunning') : t('components.apiSettings.serverStopped')}
              </Text>
              {isLoading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
            </View>

            {serverRunning && (
              <TouchableOpacity
                style={styles.urlContainer}
                onPress={() => copyToClipboard(getApiUrl(), t('components.apiSettings.apiUrl'))}
              >
                <Icon name="link" size={16} color="#007AFF" />
                <Text style={styles.urlText}>{getApiUrl()}</Text>
                <Icon name="content-copy" size={16} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          {/* Port Setting */}
          <SettingsInput
            label={t('components.apiSettings.port')}
            value={apiPort}
            onChangeText={handlePortChange}
            placeholder="8080"
            keyboardType="numeric"
            icon="numeric"
            hint={t('components.apiSettings.portHint')}
          />

          {/* API Key */}
          <View style={styles.apiKeyContainer}>
            <SettingsInput
              label={t('components.apiSettings.apiKey')}
              value={apiKey}
              onChangeText={handleApiKeyChange}
              placeholder={t('components.apiSettings.apiKeyPlaceholder')}
              secureTextEntry
              icon="key-variant"
              hint={t('components.apiSettings.apiKeyHint')}
            />
            <View style={styles.apiKeyButtons}>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={generateApiKey}
              >
                <Icon name="refresh" size={16} color="#007AFF" />
                <Text style={styles.smallButtonText}>{t('components.apiSettings.generate')}</Text>
              </TouchableOpacity>
              {apiKey ? (
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => copyToClipboard(apiKey, t('components.apiSettings.apiKeyLabel'))}
                >
                  <Icon name="content-copy" size={16} color="#007AFF" />
                  <Text style={styles.smallButtonText}>{t('components.apiSettings.copy')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Allow Control */}
          <SettingsSwitch
            label={t('components.apiSettings.allowControl')}
            value={allowControl}
            onValueChange={handleAllowControlChange}
            icon="remote"
            hint={t('components.apiSettings.allowControlHint')}
          />

          {/* API Endpoints Info */}
          <View style={styles.endpointsContainer}>
            <Text style={styles.endpointsTitle}>{t('components.apiSettings.availableEndpoints')}</Text>

            <View style={styles.endpointCategory}>
              <Text style={styles.categoryLabel}>{t('components.apiSettings.getReadOnly')}</Text>
              <Text style={styles.endpoint}>{t('components.apiSettings.getEndpoints')}</Text>
            </View>

            {allowControl && (
              <View style={styles.endpointCategory}>
                <Text style={styles.categoryLabel}>{t('components.apiSettings.postControl')}</Text>
                <Text style={styles.endpoint}>{t('components.apiSettings.postEndpoints')}</Text>
              </View>
            )}

            {allowControl && (
              <View style={styles.endpointCategory}>
                <Text style={styles.categoryLabel}>{t('components.apiSettings.postRemoteControl')}</Text>
                <Text style={styles.endpoint}>{t('components.apiSettings.postRemoteEndpoints')}</Text>
              </View>
            )}
          </View>

          {/* Home Assistant Hint */}
          <View style={styles.hintContainer}>
            <Icon name="home-assistant" size={20} color="#41BDF5" />
            <Text style={styles.hintText}>
              {t('components.apiSettings.haHint')}
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
    color: '#1e63d6',
    lineHeight: 18,
  },
});
