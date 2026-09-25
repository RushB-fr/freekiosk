/**
 * ManagedAppInstaller.ts
 * TS bridge for the native ManagedAppInstaller module — installs a third-party
 * APK pushed by FreeKiosk Cloud (OTA). Silent install requires Device Owner.
 */
import { NativeModules } from 'react-native';

const { ManagedAppInstaller: Native } = NativeModules;

export interface ManagedInstallResult {
  status: string;
  package: string;
}

export const ManagedAppInstaller = {
  /** Whether silent install is possible (Device Owner mode). */
  async isDeviceOwner(): Promise<boolean> {
    if (!Native?.isDeviceOwner) return false;
    try {
      return await Native.isDeviceOwner();
    } catch {
      return false;
    }
  },

  /**
   * Download an APK from `url` (with optional Bearer `authToken`) and install it
   * silently. Rejects if not Device Owner or on download/install failure.
   */
  installFromUrl(
    url: string,
    authToken: string | null,
    expectedPackage: string | null,
  ): Promise<ManagedInstallResult> {
    if (!Native?.installFromUrl) {
      return Promise.reject(new Error('ManagedAppInstaller native module unavailable'));
    }
    return Native.installFromUrl(url, authToken, expectedPackage);
  },
};

export default ManagedAppInstaller;
