/**
 * FreeKiosk v1.2 - General Tab
 * Display mode, URL/App selection, PIN configuration
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import {
  SettingsSection,
  SettingsInput,
  SettingsSwitch,
  SettingsModeSelector,
  SettingsInfoBox,
  SettingsButton,
  UrlListEditor,
  ScheduleEventList,
} from '../../../components/settings';
import { Colors, Spacing, Typography } from '../../../theme';
import AppLauncherModule, { AppInfo } from '../../../utils/AppLauncherModule';
import { ScheduledEvent } from '../../../types/planner';

interface GeneralTabProps {
  // Display mode
  displayMode: 'webview' | 'external_app';
  onDisplayModeChange: (mode: 'webview' | 'external_app') => void;
  
  // WebView settings
  url: string;
  onUrlChange: (url: string) => void;
  
  // External app settings
  externalAppPackage: string;
  onExternalAppPackageChange: (pkg: string) => void;
  onPickApp: () => void;
  loadingApps: boolean;
  
  // Permissions
  hasOverlayPermission: boolean;
  onRequestOverlayPermission: () => void;
  hasUsageStatsPermission: boolean;
  onRequestUsageStatsPermission: () => void;
  isDeviceOwner: boolean;
  
  // PIN
  pin: string;
  onPinChange: (pin: string) => void;
  isPinConfigured: boolean;
  pinModeChanged: boolean;
  pinMaxAttemptsText: string;
  onPinMaxAttemptsChange: (text: string) => void;
  onPinMaxAttemptsBlur: () => void;
  pinMode: 'numeric' | 'alphanumeric';
  onPinModeChange: (mode: 'numeric' | 'alphanumeric') => void;
  
  // Dashboard mode (webview only)
  dashboardModeEnabled: boolean;
  onDashboardModeEnabledChange: (value: boolean) => void;

  // Auto reload (webview only)
  autoReload: boolean;
  onAutoReloadChange: (value: boolean) => void;
  
  // PDF Viewer (webview only)
  pdfViewerEnabled: boolean;
  onPdfViewerEnabledChange: (value: boolean) => void;
  
  // URL Rotation (webview only)
  urlRotationEnabled: boolean;
  onUrlRotationEnabledChange: (value: boolean) => void;
  urlRotationList: string[];
  onUrlRotationListChange: (urls: string[]) => void;
  urlRotationInterval: string;
  onUrlRotationIntervalChange: (value: string) => void;
  
  // URL Planner (webview only)
  urlPlannerEnabled: boolean;
  onUrlPlannerEnabledChange: (value: boolean) => void;
  urlPlannerEvents: ScheduledEvent[];
  onUrlPlannerEventsChange: (events: ScheduledEvent[]) => void;
  onAddRecurringEvent: () => void;
  onAddOneTimeEvent: () => void;
  onEditEvent: (event: ScheduledEvent) => void;
  
  // WebView Back Button (webview only)
  webViewBackButtonEnabled: boolean;
  onWebViewBackButtonEnabledChange: (value: boolean) => void;
  webViewBackButtonXPercent: string;
  onWebViewBackButtonXPercentChange: (value: string) => void;
  webViewBackButtonYPercent: string;
  onWebViewBackButtonYPercentChange: (value: string) => void;
  onResetWebViewBackButtonPosition: () => void;
  
  // Inactivity Return to Home (webview only)
  inactivityReturnEnabled: boolean;
  onInactivityReturnEnabledChange: (value: boolean) => void;
  inactivityReturnDelay: string;
  onInactivityReturnDelayChange: (value: string) => void;
  inactivityReturnResetOnNav: boolean;
  onInactivityReturnResetOnNavChange: (value: boolean) => void;
  inactivityReturnClearCache: boolean;
  onInactivityReturnClearCacheChange: (value: boolean) => void;
  inactivityReturnScrollTop: boolean;
  onInactivityReturnScrollTopChange: (value: boolean) => void;
  
  // Navigation
  onBackToKiosk: () => void;
}

const GeneralTab: React.FC<GeneralTabProps> = ({
  displayMode,
  onDisplayModeChange,
  url,
  onUrlChange,
  externalAppPackage,
  onExternalAppPackageChange,
  onPickApp,
  loadingApps,
  hasOverlayPermission,
  onRequestOverlayPermission,
  hasUsageStatsPermission,
  onRequestUsageStatsPermission,
  isDeviceOwner,
  pin,
  onPinChange,
  isPinConfigured,
  pinModeChanged,
  pinMaxAttemptsText,
  onPinMaxAttemptsChange,
  onPinMaxAttemptsBlur,
  pinMode,
  onPinModeChange,
  dashboardModeEnabled,
  onDashboardModeEnabledChange,
  autoReload,
  onAutoReloadChange,
  pdfViewerEnabled,
  onPdfViewerEnabledChange,
  urlRotationEnabled,
  onUrlRotationEnabledChange,
  urlRotationList,
  onUrlRotationListChange,
  urlRotationInterval,
  onUrlRotationIntervalChange,
  urlPlannerEnabled,
  onUrlPlannerEnabledChange,
  urlPlannerEvents,
  onUrlPlannerEventsChange,
  onAddRecurringEvent,
  onAddOneTimeEvent,
  onEditEvent,
  webViewBackButtonEnabled,
  onWebViewBackButtonEnabledChange,
  webViewBackButtonXPercent,
  onWebViewBackButtonXPercentChange,
  webViewBackButtonYPercent,
  onWebViewBackButtonYPercentChange,
  onResetWebViewBackButtonPosition,
  inactivityReturnEnabled,
  onInactivityReturnEnabledChange,
  inactivityReturnDelay,
  onInactivityReturnDelayChange,
  inactivityReturnResetOnNav,
  onInactivityReturnResetOnNavChange,
  inactivityReturnClearCache,
  onInactivityReturnClearCacheChange,
  inactivityReturnScrollTop,
  onInactivityReturnScrollTopChange,
  onBackToKiosk,
}) => {
  return (
    <View>
      {/* Display Mode Selection */}
      <SettingsSection title="Display Mode" icon="cellphone">
        <SettingsModeSelector
          options={[
            { value: 'webview', label: 'Website', icon: 'web' },
            { value: 'external_app', label: 'Android App', icon: 'android', badge: 'BETA', badgeColor: Colors.warning },
          ]}
          value={displayMode}
          onValueChange={(value) => onDisplayModeChange(value as 'webview' | 'external_app')}
          hint="Choose to display a website or launch an Android application"
        />
        
        {/* BETA Warning for External App */}
        {displayMode === 'external_app' && (
          <>
            <SettingsInfoBox variant="warning" title="⚠️ BETA Feature">
              <Text style={styles.infoText}>
                External App mode is in beta. Some features are not available:{`
`}
                • Screensaver{`
`}
                • Motion detection{`
`}
                • Brightness control{`

`}
                To return to FreeKiosk, tap 5 times on the secret button (position configurable in Security settings).
              </Text>
            </SettingsInfoBox>
            
            {!isDeviceOwner && (
              <SettingsInfoBox variant="error" title="🔒 Device Owner Recommended">
                <Text style={styles.infoText}>
                  Without Device Owner:{`
`}
                  • Navigation buttons remain accessible{`
`}
                  • User can exit the app freely{`
`}
                  • Lock mode may not work properly
                </Text>
              </SettingsInfoBox>
            )}
          </>
        )}
      </SettingsSection>
      
      {/* How to Use */}
      <SettingsSection variant="info">
        <Text style={styles.infoTitle}>ℹ️ How to Use</Text>
        <Text style={styles.infoText}>
          • Configure the URL of the web page to display{`
`}
          • Set a secure PIN code{`
`}
          • Enable "Lock Mode" for full kiosk mode{`
`}
          • Tap 5 times on the secret button to access settings (default: bottom-right){`
`}
          • Enter PIN code to unlock
        </Text>
      </SettingsSection>
      
      {/* URL Input (WebView mode) */}
      {displayMode === 'webview' && (
        <SettingsSection title="URL to Display" icon="link-variant">
          <SettingsSwitch
            label="Use Dashboard Mode"
            value={dashboardModeEnabled}
            onValueChange={onDashboardModeEnabledChange}
            hint="Replace single URL with a multi-URL dashboard"
          />

          {dashboardModeEnabled ? (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                Dashboard mode is active. Configure your tiles in the Dashboard tab.
              </Text>
            </SettingsInfoBox>
          ) : (
            <>
              <SettingsInput
                label=""
                value={url}
                onChangeText={onUrlChange}
                placeholder="https://example.com"
                keyboardType="url"
                hint="Example: https://www.freekiosk.app"
              />

              {url.trim().toLowerCase().startsWith('http://') && (
                <SettingsInfoBox variant="warning">
                  <Text style={styles.infoText}>
                    ⚠️ SECURITY: This URL uses HTTP (unencrypted).{`
`}
                    Your data can be intercepted. Use HTTPS instead.
                  </Text>
                </SettingsInfoBox>
              )}
            </>
          )}
        </SettingsSection>
      )}
      
      {/* URL Rotation (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title="URL Rotation" icon="sync">
          {dashboardModeEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                URL Rotation is disabled in Dashboard mode.
              </Text>
            </SettingsInfoBox>
          )}
          {!dashboardModeEnabled && (
            <>
              <SettingsSwitch
                label="Enable Rotation"
                value={urlRotationEnabled}
                onValueChange={onUrlRotationEnabledChange}
                hint="Automatically cycle through multiple URLs"
              />

              {urlRotationEnabled && (
                <>
                  <View style={styles.rotationSpacer} />
                  <UrlListEditor
                    urls={urlRotationList}
                    onUrlsChange={onUrlRotationListChange}
                  />

                  <View style={styles.rotationSpacer} />
                  <SettingsInput
                    label="Rotation Interval (seconds)"
                    value={urlRotationInterval}
                    onChangeText={onUrlRotationIntervalChange}
                    placeholder="30"
                    keyboardType="numeric"
                    hint="Time between each URL change (minimum 5 seconds)"
                  />

                  {urlRotationList.length < 2 && (
                    <SettingsInfoBox variant="warning">
                      <Text style={styles.infoText}>
                        ⚠️ Add at least 2 URLs to enable rotation
                      </Text>
                    </SettingsInfoBox>
                  )}
                </>
              )}
            </>
          )}
        </SettingsSection>
      )}
      
      {/* URL Planner (WebView mode only) */}
      {displayMode === 'webview' && (
        <SettingsSection title="URL Planner" icon="calendar-clock">
          <SettingsSwitch
            label="Enable Scheduled URLs"
            value={urlPlannerEnabled}
            onValueChange={onUrlPlannerEnabledChange}
            hint="Display specific URLs at scheduled times"
          />
          
          {urlPlannerEnabled && (
            <>
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  📌 Scheduled events take priority over URL Rotation.{`
`}
                  One-time events take priority over recurring events.
                </Text>
              </SettingsInfoBox>
              
              <View style={styles.rotationSpacer} />
              
              <ScheduleEventList
                events={urlPlannerEvents}
                onEventsChange={onUrlPlannerEventsChange}
                onAddRecurring={onAddRecurringEvent}
                onAddOneTime={onAddOneTimeEvent}
                onEditEvent={onEditEvent}
              />
            </>
          )}
        </SettingsSection>
      )}
      
      {/* External App Selection */}
      {displayMode === 'external_app' && (
        <>
          <SettingsSection title="Application" icon="apps">
            <SettingsInput
              label="Package Name"
              value={externalAppPackage}
              onChangeText={onExternalAppPackageChange}
              placeholder="com.example.app"
              hint="Enter package name or select an app"
            />
            
            <SettingsButton
              title={loadingApps ? 'Loading...' : 'Choose an Application'}
              icon="format-list-bulleted"
              variant="success"
              onPress={onPickApp}
              disabled={loadingApps}
              loading={loadingApps}
            />
          </SettingsSection>
          
          {/* Overlay Permission */}
          <SettingsSection
            variant={hasOverlayPermission ? 'success' : 'warning'}
          >
            <View style={styles.permissionRow}>
              <View style={styles.permissionTextContainer}>
                <Text style={[styles.permissionTitle, { color: hasOverlayPermission ? Colors.successDark : Colors.warningDark }]}>
                  {hasOverlayPermission ? '✓ Return Button Enabled' : '⚠️ Overlay Permission Required'}
                </Text>
                <Text style={styles.permissionHint}>
                  {hasOverlayPermission
                    ? "The return button will be functional on the external app."
                    : "Enable permission to use the return button on the app."}
                </Text>
              </View>
            </View>
            
            {!hasOverlayPermission && (
              <SettingsButton
                title="Enable Permission"
                variant="success"
                onPress={onRequestOverlayPermission}
              />
            )}
          </SettingsSection>
          
          {/* Usage Stats Permission - required for auto-relaunch monitoring */}
          <SettingsSection
            variant={hasUsageStatsPermission ? 'success' : 'warning'}
          >
            <View style={styles.permissionRow}>
              <View style={styles.permissionTextContainer}>
                <Text style={[styles.permissionTitle, { color: hasUsageStatsPermission ? Colors.successDark : Colors.warningDark }]}>
                  {hasUsageStatsPermission ? '✓ Usage Access Granted' : '⚠️ Usage Access Required'}
                </Text>
                <Text style={styles.permissionHint}>
                  {hasUsageStatsPermission
                    ? "Auto-relaunch monitoring is active. FreeKiosk can detect when the external app closes."
                    : "Required for auto-relaunch. Without this, FreeKiosk cannot detect when the external app closes or crashes."}
                </Text>
              </View>
            </View>
            
            {!hasUsageStatsPermission && (
              <SettingsButton
                title="Grant Usage Access"
                variant="warning"
                onPress={onRequestUsageStatsPermission}
              />
            )}
          </SettingsSection>
        </>
      )}
      
      {/* Password Configuration */}
      <SettingsSection title="Password" icon="pin">
        <SettingsSwitch
          label="Advanced Password Mode"
          hint="Enable alphanumeric passwords with special characters. Disable for numeric PIN only (4-6 digits)."
          value={pinMode === 'alphanumeric'}
          onValueChange={(enabled) => onPinModeChange(enabled ? 'alphanumeric' : 'numeric')}
        />
        
        <SettingsInput
          label=""
          value={pin}
          onChangeText={onPinChange}
          placeholder={isPinConfigured && !pinModeChanged ? '••••' : '1234'}
          keyboardType={pinMode === 'alphanumeric' ? 'default' : 'numeric'}
          secureTextEntry
          maxLength={pinMode === 'alphanumeric' ? undefined : 6}
          autoCapitalize={pinMode === 'alphanumeric' ? 'none' : undefined}
          error={pinModeChanged && !pin ? '⚠️ New password required after mode change' : undefined}
          hint={pinModeChanged
            ? '⚠️ Mode changed - You MUST enter a new password'
            : isPinConfigured
              ? '✓ Password configured - Leave empty to keep current password'
              : pinMode === 'alphanumeric'
                ? 'Minimum 4 characters. Can include letters, numbers, and special characters.'
                : 'Numeric PIN: 4-6 digits (default: 1234)'}
        />
        
        <View style={styles.pinAttemptsContainer}>
          <SettingsInput
            label="🔒 Max Attempts Before Lockout (15min)"
            value={pinMaxAttemptsText}
            onChangeText={onPinMaxAttemptsChange}
            onBlur={onPinMaxAttemptsBlur}
            keyboardType="numeric"
            maxLength={3}
            placeholder="5"
            hint="Number of incorrect password attempts allowed (1-100)"
          />
        </View>
      </SettingsSection>
      
      {/* Inactivity Return to Home - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Inactivity Return" icon="timer-sand">
          <SettingsSwitch
            label="Return to Start Page on Inactivity"
            value={inactivityReturnEnabled}
            onValueChange={onInactivityReturnEnabledChange}
            hint="Automatically navigate back to the start URL when the screen hasn't been touched for a set duration"
          />
          
          {inactivityReturnEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsInput
                label="Inactivity Timeout (seconds)"
                value={inactivityReturnDelay}
                onChangeText={onInactivityReturnDelayChange}
                placeholder="60"
                keyboardType="numeric"
                hint="Time in seconds before returning to start page (5-3600)"
              />
              
              <View style={styles.rotationSpacer} />
              <SettingsSwitch
                label="Reset Timer on Page Load"
                value={inactivityReturnResetOnNav}
                onValueChange={onInactivityReturnResetOnNavChange}
                hint="Restart the inactivity timer when a new page loads within the WebView"
              />
              
              <SettingsSwitch
                label="Clear Cache on Return"
                value={inactivityReturnClearCache}
                onValueChange={onInactivityReturnClearCacheChange}
                hint="Clear the WebView cache when returning to the start page (full reload)"
              />
              
              <SettingsSwitch
                label="Scroll to Top on Start Page"
                value={inactivityReturnScrollTop}
                onValueChange={onInactivityReturnScrollTopChange}
                hint="Smoothly scroll back to the top of the page when already on the start page"
              />
              
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  ℹ️ The timer resets on every touch interaction.{`\n`}
                  If already on the start page and scroll-to-top is enabled, the page will scroll up.{`\n`}
                  Disabled during URL Rotation, URL Planner, and Screensaver.
                </Text>
              </SettingsInfoBox>
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Auto Reload - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Auto Reload" icon="refresh">
          <SettingsSwitch
            label="Reload on Error"
            hint="Automatically reload the page on network error"
            value={autoReload}
            onValueChange={onAutoReloadChange}
          />
        </SettingsSection>
      )}
      
      {/* PDF Viewer - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="PDF Viewer" icon="file-pdf-box">
          <SettingsSwitch
            label="Inline PDF Viewer"
            hint="Display PDF files directly in the browser instead of downloading them"
            value={pdfViewerEnabled}
            onValueChange={onPdfViewerEnabledChange}
          />
          
          {pdfViewerEnabled && (
            <SettingsInfoBox variant="info">
              <Text style={styles.infoText}>
                {'📄 PDF links will open in a built-in viewer with page navigation and zoom controls.\n\n'}
                {'⚠️ Enabling this feature allows file access in the WebView for the local PDF renderer. Only enable if your kiosk website links to PDF files.'}
              </Text>
            </SettingsInfoBox>
          )}
        </SettingsSection>
      )}
      
      {/* WebView Back Button - WebView only */}
      {displayMode === 'webview' && (
        <SettingsSection title="Web Navigation Button" icon="arrow-left-circle">
          <SettingsSwitch
            label="Enable Back Button"
            hint="Show a floating button to navigate back in web history (NOT app navigation)"
            value={webViewBackButtonEnabled}
            onValueChange={onWebViewBackButtonEnabledChange}
          />
          
          {webViewBackButtonEnabled && (
            <>
              <View style={styles.rotationSpacer} />
              <SettingsInfoBox variant="info">
                <Text style={styles.infoText}>
                  ℹ️ This button only navigates within the web page history.{`
`}
                  It will NOT exit the kiosk mode or return to settings.
                </Text>
              </SettingsInfoBox>
              
              <View style={styles.rotationSpacer} />
              <SettingsInput
                label="Position X (%)"
                value={webViewBackButtonXPercent}
                onChangeText={onWebViewBackButtonXPercentChange}
                placeholder="2"
                keyboardType="numeric"
                hint="Horizontal position: 0% (left) to 100% (right)"
              />
              
              <SettingsInput
                label="Position Y (%)"
                value={webViewBackButtonYPercent}
                onChangeText={onWebViewBackButtonYPercentChange}
                placeholder="10"
                keyboardType="numeric"
                hint="Vertical position: 0% (top) to 100% (bottom)"
              />
              
              <SettingsButton
                title="Reset to Default Position"
                icon="restore"
                variant="outline"
                onPress={onResetWebViewBackButtonPosition}
              />
            </>
          )}
        </SettingsSection>
      )}
      
      {/* Back to Kiosk Button */}
      <SettingsButton
        title="Back to Kiosk"
        icon="arrow-u-left-top"
        variant="outline"
        onPress={onBackToKiosk}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  infoText: {
    ...Typography.body,
    lineHeight: 22,
  },
  infoTitle: {
    ...Typography.label,
    color: Colors.infoDark,
    marginBottom: Spacing.sm,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionTextContainer: {
    flex: 1,
  },
  permissionTitle: {
    ...Typography.label,
    marginBottom: 4,
  },
  permissionHint: {
    ...Typography.hint,
  },
  pinAttemptsContainer: {
    marginTop: Spacing.lg,
  },
  rotationSpacer: {
    height: Spacing.md,
  },
});

export default GeneralTab;
