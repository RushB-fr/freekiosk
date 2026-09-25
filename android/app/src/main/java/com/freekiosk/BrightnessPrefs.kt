package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.Window
import android.view.WindowManager

/**
 * Single source of truth for the brightness FreeKiosk has been asked to hold (#242).
 *
 * Brightness used to be a window attribute only. Every wake path then blanked that
 * override back to BRIGHTNESS_OVERRIDE_NONE, and since nothing ever wrote
 * Settings.System.SCREEN_BRIGHTNESS, the panel fell back to a system value FreeKiosk
 * had never touched. On the reported device that was 14/255, so every wake looked
 * almost black while Home Assistant still reported the requested 80%.
 *
 * Two stores, on purpose:
 *
 * - SharedPreferences, because the wake paths are broadcast receivers that run with no
 *   JS thread, so AsyncStorage is out of reach. This mirrors the existing pattern for
 *   keep_screen_on and auto_wake_on_screen_off (KioskModule.setKeepScreenOn).
 * - Settings.System.SCREEN_BRIGHTNESS, so the fallback the platform reaches for is the
 *   level that was actually requested. This is what makes the value survive an app
 *   restart or a reboot rather than only a screen-off cycle.
 *
 * The window override is still applied, and still wins while FreeKiosk is in front. The
 * system write is what makes losing that override harmless.
 */
object BrightnessPrefs {
    private const val TAG = "BrightnessPrefs"
    private const val PREFS_NAME = "FreeKioskSettings"
    private const val KEY_DEFAULT_BRIGHTNESS = "default_brightness"

    /** Unset marker. Float, because the window attribute scale is 0f..1f. */
    const val UNSET = -1f

    /**
     * Floor for a *persisted* level. 0f is a legitimate transient value (it is how the
     * screensaver makes the screen look off) but a terrible thing to store: the wake
     * paths would re-apply it for ever and the kiosk would come back black with no
     * recovery, which is worse than the bug this fixes. The manual brightness slider
     * and the REST setBrightness action both accept 0, so this is reachable.
     *
     * 0.02f is about 5/255, dim but visible. The transient path (setBrightnessLevel,
     * used by the screensaver and the light sensor) is untouched and still accepts 0.
     */
    private const val MIN_PERSISTED = 0.02f

    /** Remembers the adaptive-brightness mode we found, so opting out can restore it. */
    private const val KEY_PREVIOUS_BRIGHTNESS_MODE = "previous_brightness_mode"

    /**
     * Conventional maximum for Settings.System.SCREEN_BRIGHTNESS. Not universal: a few
     * panels run a different range, and there is no public API exposing it (the real
     * bounds live in a framework resource). A device whose maximum is higher will read
     * this as dimmer than requested rather than failing, which is why the window
     * override is kept as the primary mechanism.
     */
    private const val SYSTEM_BRIGHTNESS_MAX = 255

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** The level FreeKiosk should hold, or [UNSET] when the user has not chosen one. */
    fun stored(context: Context): Float =
        try {
            prefs(context).getFloat(KEY_DEFAULT_BRIGHTNESS, UNSET).let {
                when {
                    it < 0f || it > 1f -> UNSET
                    // Floor on read too: a 0f written by an earlier build of this code
                    // would otherwise keep blacking the screen on every wake.
                    else -> it.coerceAtLeast(MIN_PERSISTED)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not read stored brightness: ${e.message}")
            UNSET
        }

    /** Mirror a requested level for the receivers that run without JS. */
    fun store(context: Context, level: Float) {
        try {
            prefs(context).edit()
                .putFloat(KEY_DEFAULT_BRIGHTNESS, level.coerceIn(MIN_PERSISTED, 1f))
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "Could not store brightness: ${e.message}")
        }
    }

    /**
     * Forget the requested level, so the wake paths go back to handing the panel to the
     * system. Called when the user opts out of brightness management entirely (#65),
     * where re-applying a stored value on every wake would be exactly what they asked
     * us to stop doing.
     */
    fun clear(context: Context) {
        try {
            restoreBrightnessMode(context)
            prefs(context).edit()
                .remove(KEY_DEFAULT_BRIGHTNESS)
                .remove(KEY_PREVIOUS_BRIGHTNESS_MODE)
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "Could not clear stored brightness: ${e.message}")
        }
    }

    /**
     * Put adaptive brightness back the way we found it. Writing a manual level has to
     * switch the system to manual mode, or the light sensor overwrites it within a
     * second; but leaving a user's adaptive brightness permanently off after they
     * disable FreeKiosk brightness management would be a silent, system-wide leftover.
     * No-op when we never changed it.
     */
    private fun restoreBrightnessMode(context: Context) {
        val previous = try {
            prefs(context).getInt(KEY_PREVIOUS_BRIGHTNESS_MODE, -1)
        } catch (e: Exception) {
            -1
        }
        if (previous < 0) return
        try {
            if (isDeviceOwnerWithSystemSetting(context)) {
                val dpm =
                    context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                dpm.setSystemSetting(
                    ComponentName(context, DeviceAdminReceiver::class.java),
                    Settings.System.SCREEN_BRIGHTNESS_MODE,
                    previous.toString()
                )
            } else if (Settings.System.canWrite(context)) {
                Settings.System.putInt(
                    context.contentResolver,
                    Settings.System.SCREEN_BRIGHTNESS_MODE,
                    previous
                )
            }
            Log.d(TAG, "Restored adaptive brightness mode to $previous")
        } catch (e: Exception) {
            Log.w(TAG, "Could not restore adaptive brightness mode: ${e.message}")
        }
    }

    /** Record the adaptive-brightness mode once, before we first override it. */
    private fun rememberBrightnessMode(context: Context) {
        try {
            val p = prefs(context)
            if (p.contains(KEY_PREVIOUS_BRIGHTNESS_MODE)) return
            val current = Settings.System.getInt(
                context.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS_MODE,
                -1
            )
            if (current >= 0) {
                p.edit().putInt(KEY_PREVIOUS_BRIGHTNESS_MODE, current).apply()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not read the adaptive brightness mode: ${e.message}")
        }
    }

    /**
     * Re-apply the stored level to a window, replacing the six copies of
     * "layoutParams.screenBrightness = BRIGHTNESS_OVERRIDE_NONE" that caused #242.
     *
     * With nothing stored this still blanks the override, which is the previous
     * behaviour and the right one for a fresh install: FreeKiosk has not been asked to
     * hold any particular level yet.
     *
     * Must run on the UI thread; every existing call site is already inside
     * runOnUiThread.
     */
    fun applyToWindow(context: Context, window: Window) {
        val level = stored(context)
        try {
            val layoutParams = window.attributes
            layoutParams.screenBrightness =
                if (level == UNSET) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE else level
            window.attributes = layoutParams
        } catch (e: Exception) {
            Log.e(TAG, "Could not apply brightness to window: ${e.message}")
        }
    }

    /**
     * Whether [writeSystem] can do anything. True as Device Owner on API 28+, or when
     * WRITE_SETTINGS has been granted through ACTION_MANAGE_WRITE_SETTINGS.
     */
    fun canWriteSystem(context: Context): Boolean =
        isDeviceOwnerWithSystemSetting(context) || Settings.System.canWrite(context)

    /**
     * Write the level to Settings.System.SCREEN_BRIGHTNESS, so it is what the platform
     * falls back to. Returns whether it landed; a false is not an error, it means the
     * device has neither Device Owner nor WRITE_SETTINGS and the window override is
     * doing the work alone.
     *
     * Adaptive brightness is switched off at the same time, because it would otherwise
     * overwrite the value from the light sensor within a second and the fix would not
     * hold. That is a system-wide change, so it is only made when a manual level is
     * actually being written.
     */
    fun writeSystem(context: Context, level: Float): Boolean {
        rememberBrightnessMode(context)
        val value = (level.coerceIn(MIN_PERSISTED, 1f) * SYSTEM_BRIGHTNESS_MAX)
            .toInt()
            .coerceIn(0, SYSTEM_BRIGHTNESS_MAX)

        if (isDeviceOwnerWithSystemSetting(context)) {
            try {
                val dpm =
                    context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                val admin = ComponentName(context, DeviceAdminReceiver::class.java)
                // SCREEN_BRIGHTNESS and SCREEN_BRIGHTNESS_MODE are both on the short
                // allowlist setSystemSetting accepts. No permission and no prompt.
                dpm.setSystemSetting(
                    admin,
                    Settings.System.SCREEN_BRIGHTNESS_MODE,
                    Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL.toString()
                )
                dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS, value.toString())
                Log.d(TAG, "System brightness set to $value/$SYSTEM_BRIGHTNESS_MAX as Device Owner")
                return true
            } catch (e: Exception) {
                Log.w(TAG, "Device Owner system brightness write failed: ${e.message}")
                // Fall through: WRITE_SETTINGS may still be held.
            }
        }

        return try {
            if (!Settings.System.canWrite(context)) {
                Log.d(TAG, "No WRITE_SETTINGS, keeping the window override only")
                false
            } else {
                Settings.System.putInt(
                    context.contentResolver,
                    Settings.System.SCREEN_BRIGHTNESS_MODE,
                    Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
                )
                Settings.System.putInt(
                    context.contentResolver,
                    Settings.System.SCREEN_BRIGHTNESS,
                    value
                )
                Log.d(TAG, "System brightness set to $value/$SYSTEM_BRIGHTNESS_MAX via WRITE_SETTINGS")
                true
            }
        } catch (e: Exception) {
            Log.w(TAG, "System brightness write failed: ${e.message}")
            false
        }
    }

    /**
     * The level the panel is actually running at, as 0f..1f, or [UNSET] when it cannot
     * be read. This is the honest answer for status and MQTT, which until #242 reported
     * the level FreeKiosk had asked for and so hid the mismatch entirely.
     */
    fun systemLevel(context: Context): Float =
        try {
            val raw = Settings.System.getInt(
                context.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS,
                -1
            )
            if (raw < 0) UNSET else (raw.toFloat() / SYSTEM_BRIGHTNESS_MAX).coerceIn(0f, 1f)
        } catch (e: Exception) {
            Log.w(TAG, "Could not read system brightness: ${e.message}")
            UNSET
        }

    private fun isDeviceOwnerWithSystemSetting(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
        return try {
            val dpm =
                context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            dpm.isDeviceOwnerApp(context.packageName)
        } catch (e: Exception) {
            false
        }
    }
}
