import { NativeModules, NativeEventEmitter } from 'react-native';

export interface AppInfo {
  packageName: string;
  appName: string;
}

/** Extended app info including non-UI packages (services, VPNs, etc.) */
export interface AppInfoAll extends AppInfo {
  hasLauncherActivity: boolean;
}

interface IAppLauncherModule {
  launchExternalApp(packageName: string): Promise<boolean>;
  isAppInstalled(packageName: string): Promise<boolean>;
  getInstalledApps(): Promise<AppInfo[]>;
  /** Returns all installed apps including non-UI user packages (fixes #112) */
  getAllInstalledApps(): Promise<AppInfoAll[]>;
  getPackageLabel(packageName: string): Promise<string>;
  getAppIcon(packageName: string, size: number): Promise<string>;
  launchBootApps(): Promise<number>;
  startBackgroundMonitor(): Promise<boolean>;
  stopBackgroundMonitor(): Promise<boolean>;
}

const { AppLauncherModule } = NativeModules;

if (!AppLauncherModule) {
  console.error('[AppLauncherModule] Native module not found. Did you rebuild the app?');
}

export const appLauncherEmitter = new NativeEventEmitter(AppLauncherModule);
export default AppLauncherModule as IAppLauncherModule;
