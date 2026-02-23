import { NativeModules } from 'react-native';

const { UpdateModule } = NativeModules;

interface VersionInfo {
  versionName: string;
  versionCode: number;
}

interface UpdateInfo {
  version: string;
  name: string;
  notes: string;
  publishedAt: string;
  downloadUrl: string;
  isPrerelease?: boolean;
}

export default {
  /**
   * Get current app version
   */
  getCurrentVersion(): Promise<VersionInfo> {
    return UpdateModule.getCurrentVersion();
  },

  /**
   * Check for available updates on GitHub (stable channel only)
   */
  checkForUpdates(): Promise<UpdateInfo> {
    return UpdateModule.checkForUpdates();
  },

  /**
   * Check for updates with optional beta/pre-release channel support.
   * @param includeBeta - If true, includes pre-release versions
   */
  checkForUpdatesWithChannel(includeBeta: boolean): Promise<UpdateInfo> {
    return UpdateModule.checkForUpdatesWithChannel(includeBeta);
  },

  /**
   * Download and install an update
   * @param downloadUrl - Direct download URL for the APK
   * @param version - Version string for display
   */
  downloadAndInstall(downloadUrl: string, version: string): Promise<boolean> {
    return UpdateModule.downloadAndInstall(downloadUrl, version);
  },
};
