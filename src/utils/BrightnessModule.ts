import { NativeModules } from 'react-native';

const { AutoBrightnessModule: NativeAutoBrightnessModule } = NativeModules;

const BrightnessModule = {
  async setBrightnessLevel(brightnessLevel: number): Promise<void> {
    const normalized = Math.max(0, Math.min(1, brightnessLevel));

    if (!NativeAutoBrightnessModule?.setBrightnessLevel) {
      throw new Error('AutoBrightnessModule.setBrightnessLevel is not available');
    }

    await NativeAutoBrightnessModule.setBrightnessLevel(normalized);
  },

  /**
   * Set the brightness FreeKiosk should hold across wakes and reboots (#242).
   *
   * Distinct from setBrightnessLevel() on purpose: that one is the transient path the
   * light sensor and the screensaver also drive, so it must not persist anything.
   * Returns whether the level also reached Settings.System, which is what makes it
   * survive a reboot.
   */
  async setDefaultBrightness(brightnessLevel: number): Promise<boolean> {
    const normalized = Math.max(0, Math.min(1, brightnessLevel));

    if (!NativeAutoBrightnessModule?.setDefaultBrightness) {
      // Older native side: fall back to the transient call rather than throwing.
      await this.setBrightnessLevel(normalized);
      return false;
    }

    const result = await NativeAutoBrightnessModule.setDefaultBrightness(normalized);
    return result?.systemWrite === true;
  },

  async getBrightnessLevel(): Promise<number> {
    if (!NativeAutoBrightnessModule?.getBrightnessLevel) {
      return 0.5;
    }

    const result = await NativeAutoBrightnessModule.getBrightnessLevel();
    return typeof result === 'number' ? result : 0.5;
  },
};

export default BrightnessModule;
