/** The backup records the version of the app that wrote it, not a constant (#363). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import UpdateModule from '../src/utils/UpdateModule';
import { buildBackupJson } from '../src/utils/BackupService';

describe('backup appVersion', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is the version the native side reports', async () => {
    jest.spyOn(UpdateModule, 'getCurrentVersion').mockResolvedValue({ versionName: '2.1.0-beta.2', versionCode: 1 });

    const result = await buildBackupJson();

    expect(result.success).toBe(true);
    expect(JSON.parse(result.json!).appVersion).toBe('2.1.0-beta.2');
  });

  it('is "unknown" when the native side cannot say, and the backup is still written', async () => {
    jest.spyOn(UpdateModule, 'getCurrentVersion').mockRejectedValue(new Error('no native module'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await buildBackupJson();

    expect(result.success).toBe(true);
    expect(JSON.parse(result.json!).appVersion).toBe('unknown');
  });
});
