/**
 * FreeKiosk v1.2 - Display Tab
 * Brightness, Status Bar, Keyboard settings
 */

import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import Icon from '../../../components/Icon';
import {
  SettingsSection,
  SettingsSwitch,
  SettingsSlider,
  SettingsRadioGroup,
  SettingsInfoBox,
  SettingsInput,
} from '../../../components/settings';
import ScreenScheduleRuleCard from '../../../components/settings/ScreenScheduleRuleCard';
import ProximityDetectionModule from '../../../utils/ProximityDetectionModule';
import { Colors, Spacing, Typography } from '../../../theme';
import { ScreenScheduleRule } from '../../../types/screenScheduler';
import type { MediaItem } from '../../../types/mediaPlayer';
import { getMediaDisplayName } from '../../../types/mediaPlayer';
import { useTranslation } from 'react-i18next';

interface DisplayTabProps {
  displayMode: 'webview' | 'external_app' | 'media_player';
  
  // Brightness management (allow system to manage)
  brightnessManagementEnabled: boolean;
  onBrightnessManagementEnabledChange: (value: boolean) => void;
  
  // Default brightness
  defaultBrightness: number;
  onDefaultBrightnessChange: (value: number) => void;
  
  // Auto-brightness
  autoBrightnessEnabled: boolean;
  onAutoBrightnessEnabledChange: (value: boolean) => void;
  autoBrightnessMin: number;
  onAutoBrightnessMinChange: (value: number) => void;
  autoBrightnessMax: number;
  onAutoBrightnessMaxChange: (value: number) => void;
  autoBrightnessOffset: number;
  onAutoBrightnessOffsetChange: (value: number) => void;
  currentLightLevel: number;
  hasLightSensor: boolean;
  
  // Status bar
  statusBarEnabled: boolean;
  onStatusBarEnabledChange: (value: boolean) => void;
  statusBarOnOverlay: boolean;
  onStatusBarOnOverlayChange: (value: boolean) => void;
  statusBarOnReturn: boolean;
  onStatusBarOnReturnChange: (value: boolean) => void;
  
  // Status bar items
  showBattery: boolean;
  onShowBatteryChange: (value: boolean) => void;
  showWifi: boolean;
  onShowWifiChange: (value: boolean) => void;
  showBluetooth: boolean;
  onShowBluetoothChange: (value: boolean) => void;
  showVolume: boolean;
  onShowVolumeChange: (value: boolean) => void;
  showTime: boolean;
  onShowTimeChange: (value: boolean) => void;
  statusBarTheme: 'dark' | 'light';
  onStatusBarThemeChange: (value: string) => void;
  
  // Keyboard mode
  keyboardMode: string;
  onKeyboardModeChange: (value: string) => void;
  
  // WebView Zoom Level
  zoomLevel: number;
  onZoomLevelChange: (value: number) => void;
  zoomMode: string;
  onZoomModeChange: (value: string) => void;
  disableUserZoom: boolean;
  onDisableUserZoomChange: (value: boolean) => void;
  
  // Custom User Agent
  customUserAgent: string;
  onCustomUserAgentChange: (value: string) => void;
  pauseWebMediaWhenHidden: boolean;
  onPauseWebMediaWhenHiddenChange: (value: boolean) => void;
  intercomModeEnabled: boolean;
  onIntercomModeChange: (value: boolean) => void;

  // Screensaver
  screensaverEnabled: boolean;
  onScreensaverEnabledChange: (value: boolean) => void;
  screensaverBrightness: number;
  onScreensaverBrightnessChange: (value: number) => void;
  inactivityDelay: string;
  onInactivityDelayChange: (value: string) => void;

  // Screensaver style (dim/url/video)
  screensaverType: 'dim' | 'url' | 'video';
  onScreensaverTypeChange: (value: 'dim' | 'url' | 'video') => void;
  screensaverUrl: string;
  onScreensaverUrlChange: (value: string) => void;
  screensaverVideoItems: MediaItem[];
  onScreensaverVideoItemsChange: (items: MediaItem[]) => void;
  screensaverVideoLoop: boolean;
  onScreensaverVideoLoopChange: (value: boolean) => void;
  onPickScreensaverMedia: (type: 'video' | 'image' | 'any') => void;
  pickingScreensaverMedia: boolean;

  // Motion detection
  motionEnabled: boolean;
  onMotionEnabledChange: (value: boolean) => void;
  motionSensitivity: 'low' | 'medium' | 'high';
  onMotionSensitivityChange: (value: 'low' | 'medium' | 'high') => void;
  motionCameraPosition: 'front' | 'back';
  onMotionCameraPositionChange: (value: 'front' | 'back') => void;

  // Proximity detection (hardware sensor wake trigger)
  proximityEnabled: boolean;
  onProximityEnabledChange: (value: boolean) => void;
  availableCameras: Array<{position: 'front' | 'back', id: string}>;
  
  // Screen Sleep Scheduler
  screenSchedulerEnabled: boolean;
  onScreenSchedulerEnabledChange: (value: boolean) => void;
  screenSchedulerRules: ScreenScheduleRule[];
  onScreenSchedulerRulesChange: (rules: ScreenScheduleRule[]) => void;
  screenSchedulerWakeOnTouch: boolean;
  onScreenSchedulerWakeOnTouchChange: (value: boolean) => void;
  onAddScheduleRule: () => void;
  onEditScheduleRule: (rule: ScreenScheduleRule) => void;
  
  // Keep Screen On
  keepScreenOn: boolean;
  onKeepScreenOnChange: (value: boolean) => void;

  // Auto Wake on Screen Off
  autoWakeOnScreenOff: boolean;
  onAutoWakeOnScreenOffChange: (value: boolean) => void;
}

const DisplayTab: React.FC<DisplayTabProps> = ({
  displayMode,
  brightnessManagementEnabled,
  onBrightnessManagementEnabledChange,
  defaultBrightness,
  onDefaultBrightnessChange,
  autoBrightnessEnabled,
  onAutoBrightnessEnabledChange,
  autoBrightnessMin,
  onAutoBrightnessMinChange,
  autoBrightnessMax,
  onAutoBrightnessMaxChange,
  autoBrightnessOffset,
  onAutoBrightnessOffsetChange,
  currentLightLevel,
  hasLightSensor,
  statusBarEnabled,
  onStatusBarEnabledChange,
  statusBarOnOverlay,
  onStatusBarOnOverlayChange,
  statusBarOnReturn,
  onStatusBarOnReturnChange,
  showBattery,
  onShowBatteryChange,
  showWifi,
  onShowWifiChange,
  showBluetooth,
  onShowBluetoothChange,
  showVolume,
  onShowVolumeChange,
  showTime,
  onShowTimeChange,
  statusBarTheme,
  onStatusBarThemeChange,
  keyboardMode,
  onKeyboardModeChange,
  zoomLevel,
  onZoomLevelChange,
  zoomMode,
  onZoomModeChange,
  disableUserZoom,
  onDisableUserZoomChange,
  customUserAgent,
  onCustomUserAgentChange,
  pauseWebMediaWhenHidden,
  onPauseWebMediaWhenHiddenChange,
  intercomModeEnabled,
  onIntercomModeChange,
  screensaverEnabled,
  onScreensaverEnabledChange,
  screensaverBrightness,
  onScreensaverBrightnessChange,
  inactivityDelay,
  onInactivityDelayChange,
  screensaverType,
  onScreensaverTypeChange,
  screensaverUrl,
  onScreensaverUrlChange,
  screensaverVideoItems,
  onScreensaverVideoItemsChange,
  screensaverVideoLoop,
  onScreensaverVideoLoopChange,
  onPickScreensaverMedia,
  pickingScreensaverMedia,
  motionEnabled,
  onMotionEnabledChange,
  motionSensitivity,
  onMotionSensitivityChange,
  motionCameraPosition,
  onMotionCameraPositionChange,
  proximityEnabled,
  onProximityEnabledChange,
  availableCameras,
  screenSchedulerEnabled,
  onScreenSchedulerEnabledChange,
  screenSchedulerRules,
  onScreenSchedulerRulesChange,
  screenSchedulerWakeOnTouch,
  onScreenSchedulerWakeOnTouchChange,
  keepScreenOn,
  onKeepScreenOnChange,
  autoWakeOnScreenOff,
  onAutoWakeOnScreenOffChange,
  onAddScheduleRule,
  onEditScheduleRule,
}) => {
  const { t } = useTranslation();

  const handleCameraPositionChange = (value: string) => {
    if (value === 'front' || value === 'back') {
      onMotionCameraPositionChange(value);
    }
  };

  const handleMotionSensitivityChange = (value: string) => {
    if (value === 'low' || value === 'medium' || value === 'high') {
      onMotionSensitivityChange(value);
    }
  };

  // Generate camera options from available cameras (deduplicated by position)
  const uniquePositions = Array.from(new Set(availableCameras.map(cam => cam.position)));
  const cameraOptions = uniquePositions.map(position => ({
    label: position === 'front' ? t('display.screensaver.frontCamera') : t('display.screensaver.backCamera'),
    value: position,
  }));

  // Check whether the selected camera is available on this device
  const selectedCameraAvailable = availableCameras.some(cam => cam.position === motionCameraPosition);

  // Detect whether this device has a hardware proximity sensor (many tablets don't).
  const [proximityAvailable, setProximityAvailable] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    ProximityDetectionModule?.isAvailable()
      .then((available) => { if (!cancelled) setProximityAvailable(available); })
      .catch(() => { if (!cancelled) setProximityAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <View>
      {/* App Brightness Control toggle - WebView mode only (external app mode doesn't manage brightness) */}
      {displayMode !== 'external_app' && (
        <SettingsSection title={t('display.brightness.title')} icon="brightness-6">
          <SettingsSwitch
            label={t('display.brightness.appControl')}
            hint={brightnessManagementEnabled
              ? t('display.brightness.hintManaged')
              : t('display.brightness.hintSystem')}
            value={brightnessManagementEnabled}
            onValueChange={onBrightnessManagementEnabledChange}
          />
          {!brightnessManagementEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('display.brightness.systemInfo')}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}

      {/* Default Brightness - Only in WebView mode and when app manages brightness */}
      {displayMode !== 'external_app' && brightnessManagementEnabled && (
        <SettingsSection title={t('display.manualBrightness.title')} icon="brightness-6">
          <SettingsSlider
            label=""
            hint={autoBrightnessEnabled
              ? t('display.manualBrightness.hintDisabled')
              : t('display.manualBrightness.hint')}
            value={defaultBrightness}
            onValueChange={onDefaultBrightnessChange}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            disabled={autoBrightnessEnabled}
          />
          {autoBrightnessEnabled && (
            <SettingsInfoBox variant="warning">
              <Text style={styles.infoText}>
                {t('display.manualBrightness.disabledWarning')}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}

      {/* Auto-Brightness - WebView only, and only when app manages brightness */}
      {displayMode !== 'external_app' && brightnessManagementEnabled && (
        <SettingsSection title={t('display.autoBrightness.title')} icon="brightness-auto">
          <SettingsSwitch
            label={t('display.autoBrightness.enable')}
            hint={t('display.autoBrightness.enableHint')}
            value={autoBrightnessEnabled}
            onValueChange={onAutoBrightnessEnabledChange}
            disabled={!hasLightSensor}
          />

          {!hasLightSensor && (
            <SettingsInfoBox variant="error">
              <Text style={styles.infoText}>
                {t('display.autoBrightness.noSensor')}
              </Text>
            </SettingsInfoBox>
          )}

          {hasLightSensor && autoBrightnessEnabled && (
            <>
              <SettingsSlider
                label={t('display.autoBrightness.min')}
                hint={t('display.autoBrightness.minHint')}
                value={autoBrightnessMin}
                onValueChange={onAutoBrightnessMinChange}
                minimumValue={0}
                maximumValue={1}
                step={0.05}
                presets={[
                  { label: '5%', value: 0.05 },
                  { label: '10%', value: 0.1 },
                  { label: '20%', value: 0.2 },
                ]}
              />

              <SettingsSlider
                label={t('display.autoBrightness.max')}
                hint={t('display.autoBrightness.maxHint')}
                value={autoBrightnessMax}
                onValueChange={onAutoBrightnessMaxChange}
                minimumValue={0}
                maximumValue={1}
                step={0.05}
                presets={[
                  { label: '80%', value: 0.8 },
                  { label: '90%', value: 0.9 },
                  { label: '100%', value: 1.0 },
                ]}
              />

              <SettingsSlider
                label={t('display.autoBrightness.offset')}
                hint={t('display.autoBrightness.offsetHint')}
                value={autoBrightnessOffset}
                onValueChange={onAutoBrightnessOffsetChange}
                minimumValue={0}
                maximumValue={0.5}
                step={0.05}
                presets={[
                  { label: '0%', value: 0 },
                  { label: '+10%', value: 0.1 },
                  { label: '+20%', value: 0.2 },
                ]}
              />

              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('display.autoBrightness.currentLight', { value: currentLightLevel.toFixed(1) })}
                </Text>
              </SettingsInfoBox>
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Screen Always On - WebView mode only (external app mode: system manages screen) */}
      {displayMode !== 'external_app' && (
      <SettingsSection title={t('display.screenAlwaysOn.title')} icon="monitor">
        <SettingsSwitch
          label={t('display.screenAlwaysOn.keepOn')}
          hint={keepScreenOn
            ? t('display.screenAlwaysOn.keepOnHintOn')
            : t('display.screenAlwaysOn.keepOnHintOff')}
          value={keepScreenOn}
          onValueChange={onKeepScreenOnChange}
        />
        {!keepScreenOn && (
          <SettingsInfoBox variant="warning">
            <Text style={styles.infoText}>
              {t('display.screenAlwaysOn.timeoutWarning')}
            </Text>
          </SettingsInfoBox>
        )}
        <SettingsSwitch
          label={t('display.screenAlwaysOn.autoWake')}
          hint={autoWakeOnScreenOff
            ? t('display.screenAlwaysOn.autoWakeHintOn')
            : t('display.screenAlwaysOn.autoWakeHintOff')}
          value={autoWakeOnScreenOff}
          onValueChange={onAutoWakeOnScreenOffChange}
        />
        {autoWakeOnScreenOff && (
          <SettingsInfoBox variant="info">
            <Text style={styles.infoText}>
              {t('display.screenAlwaysOn.autoWakeInfo')}
            </Text>
          </SettingsInfoBox>
        )}
      </SettingsSection>
      )}
      
      {/* Screensaver - available in all display modes (keepScreenOn required for webview/media_player) */}
      {(displayMode === 'external_app' || keepScreenOn) && (
        <SettingsSection title={t('display.screensaver.title')} icon="weather-night">
          <SettingsSwitch
            label={t('display.screensaver.enable')}
            hint={t('display.screensaver.enableHint')}
            value={screensaverEnabled}
            onValueChange={onScreensaverEnabledChange}
          />

          {displayMode === 'external_app' && screensaverEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('display.screensaver.externalAppInfo')}
              </Text>
            </SettingsInfoBox>
          )}

          {screensaverEnabled && (
            <>
              {/* Screensaver Style (dim / url / video) */}
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>{t('display.screensaver.styleTitle')}</Text>
                <SettingsRadioGroup
                  options={[
                    { label: t('display.screensaver.styleDim'), value: 'dim', hint: t('display.screensaver.styleDimHint') },
                    { label: t('display.screensaver.styleUrl'), value: 'url', hint: t('display.screensaver.styleUrlHint') },
                    { label: t('display.screensaver.styleVideo'), value: 'video', hint: t('display.screensaver.styleVideoHint') },
                  ]}
                  value={screensaverType}
                  onValueChange={(v) => onScreensaverTypeChange(v as 'dim' | 'url' | 'video')}
                />

                {screensaverType === 'url' && (
                  <>
                    <SettingsInput
                      label={t('display.screensaver.urlLabel')}
                      value={screensaverUrl}
                      onChangeText={onScreensaverUrlChange}
                      placeholder="https://example.com/clock"
                      keyboardType="url"
                      autoCapitalize="none"
                      hint={t('display.screensaver.urlHint')}
                    />
                    {screensaverUrl.trim().length > 0 && (() => {
                      try { new URL(screensaverUrl.trim()); return null; } catch {
                        return (
                          <SettingsInfoBox variant="error">
                            <Text style={styles.infoText}>
                              {t('display.screensaver.invalidUrl')}
                            </Text>
                          </SettingsInfoBox>
                        );
                      }
                    })()}
                  </>
                )}

                {screensaverType === 'video' && (
                  <>
                    <SettingsInfoBox variant="info">
                      <Text style={styles.infoText}>
                        {t('display.screensaver.pickInfo')}
                      </Text>
                    </SettingsInfoBox>
                    <TouchableOpacity
                      style={[styles.ssPickButton, pickingScreensaverMedia && styles.ssPickButtonDisabled]}
                      onPress={() => !pickingScreensaverMedia && onPickScreensaverMedia('any')}
                      disabled={pickingScreensaverMedia}
                    >
                      <Text style={styles.ssPickButtonText}>
                        {pickingScreensaverMedia ? t('display.screensaver.picking') : t('display.screensaver.pickFromDevice')}
                      </Text>
                    </TouchableOpacity>

                    {screensaverVideoItems.map((item, index) => (
                      <View key={item.id} style={styles.ssMediaCard}>
                        <Text style={styles.ssMediaIndex}>{index + 1}</Text>
                        <Icon
                          name={item.type === 'video' ? 'video-outline' : 'image-outline'}
                          size={16}
                          color={Colors.textSecondary}
                          style={styles.ssMediaTypeIcon}
                        />
                        <Text style={styles.ssMediaName} numberOfLines={1}>
                          {getMediaDisplayName(item)}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            onScreensaverVideoItemsChange(screensaverVideoItems.filter(i => i.id !== item.id));
                          }}
                        >
                          <Icon name="close" size={18} color={Colors.error} style={styles.ssMediaDelete} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <SettingsSwitch
                      label={t('display.screensaver.loopPlaylist')}
                      hint={t('display.screensaver.loopPlaylistHint')}
                      value={screensaverVideoLoop}
                      onValueChange={onScreensaverVideoLoopChange}
                    />

                    {screensaverVideoItems.length === 0 && (
                      <SettingsInfoBox variant="warning">
                        <Text style={styles.infoText}>
                          {t('display.screensaver.noMediaWarning')}
                        </Text>
                      </SettingsInfoBox>
                    )}
                  </>
                )}

                {(screensaverType === 'url' || screensaverType === 'video') && screensaverBrightness < 0.1 && brightnessManagementEnabled && (
                  <SettingsInfoBox variant="warning">
                    <Text style={styles.infoText}>
                      {t('display.screensaver.lowBrightnessWarning')}
                    </Text>
                  </SettingsInfoBox>
                )}
              </View>

              {/* Screensaver Brightness - only when app manages brightness */}
              {brightnessManagementEnabled && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>{t('display.screensaver.brightnessTitle')}</Text>
                  <SettingsSlider
                    label=""
                    hint={t('display.screensaver.brightnessHint')}
                    value={screensaverBrightness}
                    onValueChange={onScreensaverBrightnessChange}
                    minimumValue={0}
                    maximumValue={1}
                    step={0.01}
                    presets={[
                      { label: t('display.screensaver.blackScreen'), value: 0 },
                      { label: t('display.screensaver.veryDim'), value: 0.05 },
                      { label: t('display.screensaver.dim'), value: 0.1 },
                    ]}
                  />
                </View>
              )}

              {/* Inactivity Delay */}
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>{t('display.screensaver.inactivityDelayTitle')}</Text>
                <SettingsInput
                  label=""
                  value={inactivityDelay}
                  onChangeText={(text) => {
                    if (/^\d*$/.test(text)) {
                      onInactivityDelayChange(text);
                    }
                  }}
                  keyboardType="numeric"
                  maxLength={3}
                  placeholder="10"
                  hint={t('display.screensaver.inactivityDelayHint')}
                />
              </View>

              {/* Motion Detection */}
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>{t('display.screensaver.motionTitle')}</Text>
                <SettingsSwitch
                  label={t('display.screensaver.motionEnable')}
                  hint={t('display.screensaver.motionEnableHint')}
                  value={motionEnabled}
                  onValueChange={onMotionEnabledChange}
                />

                {motionEnabled && (
                  <>
                    <SettingsRadioGroup
                      label={t('display.screensaver.sensitivity')}
                      hint={t('display.screensaver.sensitivityHint')}
                      options={[
                        { label: t('display.screensaver.sensitivityLow'), value: 'low' },
                        { label: t('display.screensaver.sensitivityMedium'), value: 'medium' },
                        { label: t('display.screensaver.sensitivityHigh'), value: 'high' },
                      ]}
                      value={motionSensitivity}
                      onValueChange={handleMotionSensitivityChange}
                    />

                    {availableCameras.length === 0 && (
                      <SettingsInfoBox variant="error">
                        <Text style={styles.infoText}>
                          {t('display.screensaver.noCameraError')}
                        </Text>
                      </SettingsInfoBox>
                    )}

                    {availableCameras.length === 1 && (
                      <SettingsInfoBox variant="info">
                        <Text style={styles.infoText}>
                          {t('display.screensaver.usingCameraInfo', {
                            camera: availableCameras[0].position === 'front' ? t('display.screensaver.front') : t('display.screensaver.back'),
                          })}
                        </Text>
                      </SettingsInfoBox>
                    )}

                    {availableCameras.length > 1 && (
                      <>
                        <SettingsRadioGroup
                          label={t('display.screensaver.cameraPosition')}
                          hint={t('display.screensaver.cameraPositionHint')}
                          options={cameraOptions}
                          value={motionCameraPosition}
                          onValueChange={handleCameraPositionChange}
                        />

                        {!selectedCameraAvailable && (
                          <SettingsInfoBox variant="warning">
                            <Text style={styles.infoText}>
                              {t('display.screensaver.cameraUnavailable')}
                            </Text>
                          </SettingsInfoBox>
                        )}
                      </>
                    )}

                  </>
                )}
              </View>

              {/* Proximity Detection (hardware sensor) */}
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>{t('display.screensaver.proximityTitle')}</Text>
                <SettingsSwitch
                  label={t('display.screensaver.proximityEnable')}
                  hint={t('display.screensaver.proximityEnableHint')}
                  value={proximityEnabled}
                  onValueChange={onProximityEnabledChange}
                  disabled={proximityAvailable === false}
                />

                {proximityAvailable === false && (
                  <SettingsInfoBox variant="error">
                    <Text style={styles.infoText}>
                      {t('display.screensaver.proximityNoSensor')}
                    </Text>
                  </SettingsInfoBox>
                )}

                {proximityAvailable !== false && (
                  <SettingsInfoBox variant="info">
                    <Text style={styles.infoText}>
                      {t('display.screensaver.proximityInfo')}
                    </Text>
                  </SettingsInfoBox>
                )}
              </View>

              {/* How it works */}
              <View style={styles.subSection}>
                <Text style={styles.infoTitle}>{t('display.screensaver.howItWorksTitle')}</Text>
                <Text style={styles.infoText}>
                  {t('display.screensaver.howItWorksAfter', { delay: inactivityDelay || '10' })}{`
`}
                  {displayMode === 'external_app'
                    ? t('display.screensaver.howItWorksExternalApp') + '\n'
                    : ''}
                  {t('display.screensaver.howItWorksTouch')}{`
`}
                  {motionEnabled && t('display.screensaver.howItWorksMotion') + '\n'}
                  {proximityEnabled && proximityAvailable !== false && t('display.screensaver.howItWorksProximity') + '\n'}
                  {t('display.screensaver.howItWorksBrightness')}
                </Text>
              </View>
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Screen Sleep Scheduler */}
      <SettingsSection title={t('display.screenSchedule.title')} icon="power-sleep">
        <SettingsSwitch
          label={t('display.screenSchedule.enable')}
          hint={t('display.screenSchedule.enableHint')}
          value={screenSchedulerEnabled}
          onValueChange={onScreenSchedulerEnabledChange}
        />

        {screenSchedulerEnabled && (
          <>
            {/* Schedule Rules List */}
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>{t('display.screenSchedule.rulesTitle')}</Text>
              {screenSchedulerRules.length === 0 ? (
                <SettingsInfoBox variant="info">
                  <Text style={styles.infoText}>
                    {t('display.screenSchedule.noRules')}
                  </Text>
                </SettingsInfoBox>
              ) : (
                <View style={styles.rulesContainer}>
                  {screenSchedulerRules.map((rule) => (
                    <ScreenScheduleRuleCard
                      key={rule.id}
                      rule={rule}
                      onToggle={(id, enabled) => {
                        onScreenSchedulerRulesChange(
                          screenSchedulerRules.map(r =>
                            r.id === id ? { ...r, enabled } : r
                          )
                        );
                      }}
                      onEdit={onEditScheduleRule}
                      onDelete={(id) => {
                        Alert.alert(
                          t('display.screenSchedule.deleteRuleTitle'),
                          t('display.screenSchedule.deleteRuleMessage'),
                          [
                            { text: t('display.screenSchedule.cancel'), style: 'cancel' },
                            {
                              text: t('display.screenSchedule.delete'),
                              style: 'destructive',
                              onPress: () => {
                                onScreenSchedulerRulesChange(
                                  screenSchedulerRules.filter(r => r.id !== id)
                                );
                              },
                            },
                          ]
                        );
                      }}
                    />
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.addRuleButton} onPress={onAddScheduleRule}>
                <Text style={styles.addRuleButtonText}>{t('display.screenSchedule.addRule')}</Text>
              </TouchableOpacity>
            </View>

            {/* Wake on Touch option */}
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>{t('display.screenSchedule.wakeOptionsTitle')}</Text>
              <SettingsSwitch
                label={t('display.screenSchedule.wakeOnTouch')}
                hint={t('display.screenSchedule.wakeOnTouchHint')}
                value={screenSchedulerWakeOnTouch}
                onValueChange={onScreenSchedulerWakeOnTouchChange}
              />
              {!screenSchedulerWakeOnTouch && (
                <SettingsInfoBox variant="warning">
                  <Text style={styles.infoText}>
                    {t('display.screenSchedule.noWakeWarning')}
                  </Text>
                </SettingsInfoBox>
              )}
            </View>

            {/* How it works */}
            <View style={styles.subSection}>
              <Text style={styles.infoTitle}>{t('display.screenSchedule.howItWorksTitle')}</Text>
              <Text style={styles.infoText}>
                {t('display.screenSchedule.howItWorksLine1')}{`\n`}
                {t('display.screenSchedule.howItWorksLine2')}{`\n`}
                {t('display.screenSchedule.howItWorksLine3')}{`\n`}
                {t('display.screenSchedule.howItWorksLine4')}{`\n`}
                {screenSchedulerWakeOnTouch
                  ? t('display.screenSchedule.touchWakeEnabled') + '\n'
                  : t('display.screenSchedule.touchWakeDisabled') + '\n'
                }
                {`\n`}
                {t('display.screenSchedule.deviceOwnerInfo')}{'\n'}
                {t('display.screenSchedule.nonDeviceOwnerInfo')}{'\n'}
                {t('display.screenSchedule.wakeAlarmInfo')}
              </Text>
            </View>
          </>
        )}
      </SettingsSection>
      
      {/* Status Bar */}
      <SettingsSection title={t('display.statusBar.title')} icon="chart-bar">
        <SettingsSwitch
          label={t('display.statusBar.show')}
          hint={t('display.statusBar.showHint')}
          value={statusBarEnabled}
          onValueChange={onStatusBarEnabledChange}
        />

        {statusBarEnabled && (
          <View style={styles.subSection}>
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('display.statusBar.layoutInfo')}
              </Text>
            </SettingsInfoBox>

            <SettingsRadioGroup
              label={t('display.statusBar.themeLabel')}
              hint={t('display.statusBar.themeHint')}
              options={[
                {
                  value: 'dark',
                  label: t('display.statusBar.themeDark'),
                  hint: t('display.statusBar.themeDarkHint'),
                  icon: 'weather-night',
                },
                {
                  value: 'light',
                  label: t('display.statusBar.themeLight'),
                  hint: t('display.statusBar.themeLightHint'),
                  icon: 'brightness-7',
                },
              ]}
              value={statusBarTheme}
              onValueChange={onStatusBarThemeChange}
            />

            {/* Customize Status Bar Items */}
            <Text style={styles.subSectionTitle}>{t('display.statusBar.customizeItems')}</Text>

            <View style={styles.itemsGrid}>
              <SettingsSwitch
                label={t('display.statusBar.battery')}
                icon="power"
                value={showBattery}
                onValueChange={onShowBatteryChange}
              />

              <SettingsSwitch
                label={t('display.statusBar.wifi')}
                icon="server-network"
                value={showWifi}
                onValueChange={onShowWifiChange}
              />

              <SettingsSwitch
                label={t('display.statusBar.bluetooth')}
                icon="remote"
                value={showBluetooth}
                onValueChange={onShowBluetoothChange}
              />

              <SettingsSwitch
                label={t('display.statusBar.volume')}
                icon="volume-high"
                value={showVolume}
                onValueChange={onShowVolumeChange}
              />

              <SettingsSwitch
                label={t('display.statusBar.time')}
                icon="clock-outline"
                value={showTime}
                onValueChange={onShowTimeChange}
              />
            </View>

            {/* External App specific options */}
            {displayMode === 'external_app' && (
              <View style={styles.externalAppOptions}>
                <Text style={styles.subSectionTitle}>{t('display.statusBar.externalAppOptions')}</Text>

                <SettingsSwitch
                  label={t('display.statusBar.onExternalApp')}
                  hint={t('display.statusBar.onExternalAppHint')}
                  value={statusBarOnOverlay}
                  onValueChange={onStatusBarOnOverlayChange}
                />

                <SettingsSwitch
                  label={t('display.statusBar.onReturnScreen')}
                  hint={t('display.statusBar.onReturnScreenHint')}
                  value={statusBarOnReturn}
                  onValueChange={onStatusBarOnReturnChange}
                />
              </View>
            )}

            {(displayMode === 'webview' || displayMode === 'media_player') && (
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  {t('display.statusBar.modeInfo', {
                    mode: displayMode === 'webview' ? t('display.statusBar.webviewMode') : t('display.statusBar.mediaPlayerMode'),
                  })}
                </Text>
              </SettingsInfoBox>
            )}
          </View>
        )}
      </SettingsSection>
      
      {/* Web Page Zoom - Only in WebView mode */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('display.zoom.title')} icon="magnify">
          <SettingsRadioGroup
            hint={t('display.zoom.hint')}
            options={[
              {
                value: 'standard',
                label: t('display.zoom.standard'),
                hint: t('display.zoom.standardHint'),
              },
              {
                value: 'fit',
                label: t('display.zoom.homeAssistant'),
                hint: t('display.zoom.homeAssistantHint'),
              },
            ]}
            value={zoomMode}
            onValueChange={onZoomModeChange}
          />
          {zoomMode === 'fit' && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('display.zoom.haModeInfo')}
              </Text>
            </SettingsInfoBox>
          )}
          <SettingsSlider
            label=""
            hint={t('display.zoom.levelHint', { value: zoomLevel })}
            value={zoomLevel}
            onValueChange={(val) => onZoomLevelChange(Math.round(val))}
            minimumValue={50}
            maximumValue={200}
            step={5}
            formatValue={(val) => `${Math.round(val)}%`}
            presets={[
              { label: '75%', value: 75 },
              { label: '100%', value: 100 },
              { label: '125%', value: 125 },
              { label: '150%', value: 150 },
            ]}
          />
          {zoomLevel !== 100 && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {t('display.zoom.currentInfo', { value: zoomLevel })}
              </Text>
            </SettingsInfoBox>
          )}
          <SettingsSwitch
            label={t('display.zoom.disableUserZoom')}
            hint={t('display.zoom.disableUserZoomHint')}
            value={disableUserZoom}
            onValueChange={onDisableUserZoomChange}
          />
        </SettingsSection>
      )}

      {/* Custom User Agent - Only in WebView mode */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('display.userAgent.title')} icon="web">
          <SettingsInput
            label={t('display.userAgent.label')}
            hint={customUserAgent.trim() ? t('display.userAgent.hintActive') : t('display.userAgent.hintDefault')}
            value={customUserAgent}
            onChangeText={onCustomUserAgentChange}
            placeholder="Mozilla/5.0 (Linux; Android 13; ...) Chrome/131..."
            autoCapitalize="none"
            multiline={true}
          />
          {customUserAgent.trim() !== '' && (
            <SettingsInfoBox variant="warning">
              <Text style={styles.infoText}>
                {t('display.userAgent.activeWarning')}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}

      {/* Web Media playback - Only in WebView mode (#177) */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('display.webMedia.title')} icon="volume-off">
          <SettingsSwitch
            label={t('display.webMedia.pauseHidden')}
            hint={t('display.webMedia.pauseHiddenHint')}
            value={pauseWebMediaWhenHidden}
            onValueChange={onPauseWebMediaWhenHiddenChange}
          />
          <SettingsSwitch
            label={t('display.webMedia.intercom')}
            hint={t('display.webMedia.intercomHint')}
            value={intercomModeEnabled}
            onValueChange={onIntercomModeChange}
          />
        </SettingsSection>
      )}

      {/* Keyboard Mode - Only in WebView mode */}
      {displayMode === 'webview' && (
        <SettingsSection title={t('display.keyboard.title')} icon="keyboard-outline">
          <SettingsRadioGroup
            hint={t('display.keyboard.hint')}
            options={[
              {
                value: 'default',
                label: t('display.keyboard.default'),
                hint: t('display.keyboard.defaultHint'),
              },
              {
                value: 'force_numeric',
                label: t('display.keyboard.forceNumeric'),
                hint: t('display.keyboard.forceNumericHint'),
              },
              {
                value: 'smart',
                label: t('display.keyboard.smart'),
                hint: t('display.keyboard.smartHint'),
              },
            ]}
            value={keyboardMode}
            onValueChange={onKeyboardModeChange}
          />
        </SettingsSection>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  subSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  subSectionTitle: {
    ...Typography.labelSmall,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  itemsGrid: {
    gap: Spacing.xs,
  },
  externalAppOptions: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  infoText: {
    ...Typography.body,
    color: Colors.infoDark,
  },
  infoTitle: {
    ...Typography.label,
    color: Colors.infoDark,
    marginBottom: Spacing.sm,
  },
  rulesContainer: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  addRuleButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  addRuleButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  ssPickButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  ssPickButtonDisabled: {
    opacity: 0.5,
  },
  ssPickButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  ssMediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: 8,
    marginVertical: Spacing.xs,
  },
  ssMediaIndex: {
    fontWeight: '600',
    marginRight: Spacing.sm,
    color: Colors.textSecondary,
    minWidth: 20,
  },
  ssMediaTypeIcon: {
    marginRight: Spacing.sm,
  },
  ssMediaName: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  ssMediaDelete: {
    paddingHorizontal: Spacing.sm,
  },
});

export default DisplayTab;
