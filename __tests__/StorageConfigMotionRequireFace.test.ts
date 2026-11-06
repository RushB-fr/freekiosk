/**
 * "Only wake for a face" is off by default, survives the config export/import round trip
 * (FreeKiosk Cloud sync; the device backup is BackupService, see BackupMotionRequireFace.test.ts),
 * is left alone by a config that does not carry it,
 * and is reset by clearAll.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '../src/utils/storage';

describe('motionDetection.requireFace', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is off by default', async () => {
    expect(await StorageService.getScreensaverMotionRequireFace()).toBe(false);
    const config: any = await StorageService.exportConfig();
    expect(config.display.motionDetection.requireFace).toBe(false);
  });

  it('imports it, and exports it back unchanged', async () => {
    await StorageService.importConfig({ display: { motionDetection: { requireFace: true } } });

    expect(await StorageService.getScreensaverMotionRequireFace()).toBe(true);
    const config: any = await StorageService.exportConfig();
    expect(config.display.motionDetection.requireFace).toBe(true);
  });

  it('leaves it alone when the pushed config does not carry it', async () => {
    await StorageService.saveScreensaverMotionRequireFace(true);

    await StorageService.importConfig({ display: { motionDetection: { enabled: true } } });

    expect(await StorageService.getScreensaverMotionRequireFace()).toBe(true);
  });

  it('is cleared by clearAll', async () => {
    await StorageService.saveScreensaverMotionRequireFace(true);

    await StorageService.clearAll();

    expect(await StorageService.getScreensaverMotionRequireFace()).toBe(false);
  });
});
