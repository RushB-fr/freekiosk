/**
 * #254: the "allow NFC tags in Lock Mode" setting is opt-in (off by default), is saved under the
 * key the native side reads, survives the config export/import round trip, and is reset by clearAll.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from '../src/utils/storage';

describe('allow NFC tags in Lock Mode (#254)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is off by default', async () => {
    expect(await StorageService.getAllowNfcTags()).toBe(false);
  });

  it('is saved under the key the native side reads (and the ADB key allow_nfc_tags writes)', async () => {
    await StorageService.saveAllowNfcTags(true);

    expect(await AsyncStorage.getItem('@kiosk_allow_nfc_tags')).toBe('true');
    expect(await StorageService.getAllowNfcTags()).toBe(true);
  });

  it('goes through the config export and import', async () => {
    await StorageService.saveAllowNfcTags(true);
    const exported: any = await StorageService.exportConfig();
    expect(exported.security.allowNfcTags).toBe(true);

    await AsyncStorage.clear();
    expect(await StorageService.getAllowNfcTags()).toBe(false);

    await StorageService.importConfig(exported);
    expect(await StorageService.getAllowNfcTags()).toBe(true);
  });

  it('is not imported when an older export does not carry it', async () => {
    await StorageService.saveAllowNfcTags(true);
    const exported: any = await StorageService.exportConfig();
    delete exported.security.allowNfcTags;

    await StorageService.importConfig(exported);

    expect(await StorageService.getAllowNfcTags()).toBe(true);
  });

  it('is cleared by clearAll', async () => {
    await StorageService.saveAllowNfcTags(true);

    await StorageService.clearAll();

    expect(await StorageService.getAllowNfcTags()).toBe(false);
  });
});
