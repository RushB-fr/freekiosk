/** "Only wake for a face" is part of the device backup (BackupService allowlist). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildBackupJson } from '../src/utils/BackupService';

describe('backup includes @screensaver_motion_require_face', () => {
  it('carries the stored value into the backup JSON', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('@screensaver_motion_require_face', 'true');

    const result = await buildBackupJson();

    expect(result.success).toBe(true);
    expect(JSON.parse(result.json!).settings['@screensaver_motion_require_face']).toBe('true');
  });
});
