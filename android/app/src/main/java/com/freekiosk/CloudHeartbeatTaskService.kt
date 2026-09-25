package com.freekiosk

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs one cloud heartbeat while FreeKiosk is backgrounded.
 *
 * Why this exists: the heartbeat loop is a JS `setInterval`, and React Native stops
 * driving JS timers as soon as the activity pauses. JavaTimerManager.onHostPause()
 * clears the Choreographer callback that dispatches them, so behind a launched external
 * app the heartbeat simply stops, the cloud sees nothing for two minutes and reports the
 * device offline while it is running perfectly.
 *
 * A foreground service does not help: the process is alive and at normal priority, the
 * timers are just not being dispatched. The supported way back in is exactly this, a
 * headless task: JavaTimerManager.onHeadlessJsTaskStart() re-arms the same callback for
 * as long as the task runs, so the JS heartbeat executes normally and finishes.
 *
 * KioskWatchdogService starts one of these on its own ticker while the app is in the
 * background. In the foreground the JS interval works on its own and this never runs.
 */
class CloudHeartbeatTaskService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
        return HeadlessJsTaskConfig(
            TASK_NAME,
            Arguments.createMap(),
            TASK_TIMEOUT_MS,
            // Allowed in the foreground only so it cannot crash the process: the task
            // itself returns at once when the app is active (index.js), since the JS
            // interval covers that case and two heartbeats would race on the config-sync
            // hash. With false, React Native throws when the task starts while the
            // activity is resumed, which happens whenever the process dies (ADB config
            // restart, OOM kill): Android restarts this service in the new process, the
            // throw kills it again, the new activity is force-finished and the external
            // app stays in front with no 5-tap overlay.
            true,
        )
    }

    companion object {
        /** Must match the name registered with AppRegistry.registerHeadlessTask in index.js. */
        const val TASK_NAME = "CloudHeartbeat"

        /**
         * One heartbeat plus a command poll, including an APK download in the worst case.
         * The task is killed past this, which only means the next tick tries again.
         */
        private const val TASK_TIMEOUT_MS = 60_000L
    }
}
