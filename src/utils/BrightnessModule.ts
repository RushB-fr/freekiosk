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

  async getBrightnessLevel(): Promise<number> {
    if (!NativeAutoBrightnessModule?.getBrightnessLevel) {
      return 0.5;
    }

    const result = await NativeAutoBrightnessModule.getBrightnessLevel();
    return typeof result === 'number' ? result : 0.5;
  },
};

export default BrightnessModule;
