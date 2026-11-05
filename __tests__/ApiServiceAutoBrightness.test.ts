/**
 * MQTT's auto_brightness switch sends autoBrightnessEnable without levels. The configured
 * min/max must stay, instead of being reset to the REST defaults 10 and 100.
 */
import { ApiService } from '../src/utils/ApiService';
import { StorageService } from '../src/utils/storage';

const AsyncStorage = require('@react-native-async-storage/async-storage');

describe('autoBrightnessEnable', () => {
  const onAutoBrightnessEnable = jest.fn();

  beforeEach(async () => {
    await AsyncStorage.clear();
    onAutoBrightnessEnable.mockClear();
    (ApiService as any).callbacks = { onAutoBrightnessEnable };
  });

  it('keeps the stored levels when none are sent (MQTT switch)', async () => {
    await StorageService.saveAutoBrightnessMin(0.15);
    await StorageService.saveAutoBrightnessMax(0.8);
    const result = await ApiService.executeAction('autoBrightnessEnable', {});
    expect(result.ok).toBe(true);
    expect(onAutoBrightnessEnable).toHaveBeenCalledWith(15, 80, undefined);
  });

  it('falls back to 10 and 100 when nothing is stored', async () => {
    await ApiService.executeAction('autoBrightnessEnable', {});
    expect(onAutoBrightnessEnable).toHaveBeenCalledWith(10, 100, undefined);
  });

  it('uses the levels and offset that are sent (REST), also 0', async () => {
    await StorageService.saveAutoBrightnessMin(0.15);
    await ApiService.executeAction('autoBrightnessEnable', { min: 0, max: 90, offset: 5 });
    expect(onAutoBrightnessEnable).toHaveBeenCalledWith(0, 90, 5);
  });

  it('fails without a handler', async () => {
    (ApiService as any).callbacks = {};
    const result = await ApiService.executeAction('autoBrightnessEnable', {});
    expect(result.ok).toBe(false);
  });
});
