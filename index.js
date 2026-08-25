/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { CLOUD_ENABLED } from './src/config/features';
import { CloudSyncService } from './src/utils/CloudSyncService';

AppRegistry.registerComponent(appName, () => App);

/**
 * Cloud heartbeat for when FreeKiosk is backgrounded (External App mode).
 *
 * React Native stops dispatching JS timers once the activity pauses, so the 30s
 * heartbeat interval in CloudSyncService simply stops running and the cloud reports the
 * device offline after two minutes. KioskWatchdogService starts this task on its own
 * native ticker instead; running as a headless task is what re-arms JS timers, so the
 * heartbeat (and the command poll it triggers) executes normally.
 */
AppRegistry.registerHeadlessTask(
  'CloudHeartbeat',
  () => async () => {
    if (!CLOUD_ENABLED) return;
    try {
      await CloudSyncService.sendHeartbeat();
    } catch {
      // Never throw out of a headless task: it would be logged as a crash and the
      // next tick retries anyway.
    }
  },
);
