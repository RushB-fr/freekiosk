package com.freekiosk

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Typed, non-secret AsyncStorage access for the authenticated REST settings API.
 *
 * The allowlist is deliberately explicit. It prevents a remote caller from discovering or
 * changing credentials, PIN material, internal migration flags, or arbitrary React Native data.
 */
object RemoteSettingsStore {
    private const val DATABASE_NAME = "RKStorage"
    private const val TABLE_NAME = "catalystLocalStorage"

    private data class Definition(val key: String, val type: String)

    private val definitions = listOf(
        Definition("@kiosk_url", "string"),
        Definition("@kiosk_auto_reload", "boolean"),
        Definition("@kiosk_enabled", "boolean"),
        Definition("@kiosk_hidden_mode_enabled", "boolean"),
        Definition("@kiosk_app_blocking_enabled", "boolean"),
        Definition("@kiosk_auto_launch", "boolean"),
        Definition("@kiosk_screen_lock_compat", "boolean"),
        Definition("@kiosk_default_launcher", "boolean"),
        Definition("@kiosk_intercom_mode", "boolean"),
        Definition("@screensaver_enabled", "boolean"),
        Definition("@screensaver_inactivity_enabled", "boolean"),
        Definition("@screensaver_inactivity_delay", "number"),
        Definition("@screensaver_motion_enabled", "boolean"),
        Definition("@screensaver_motion_sensitivity", "number"),
        Definition("@screensaver_motion_delay", "number"),
        Definition("@screensaver_brightness", "number"),
        Definition("@screensaver_type", "string"),
        Definition("@screensaver_url", "string"),
        Definition("@screensaver_video_items", "json"),
        Definition("@screensaver_video_loop", "boolean"),
        Definition("@default_brightness", "number"),
        Definition("@kiosk_max_volume_percent", "number"),
        Definition("@kiosk_display_mode", "string"),
        Definition("@kiosk_external_app_package", "string"),
        Definition("@kiosk_external_app_mode", "string"),
        Definition("@kiosk_external_app_background_color", "string"),
        Definition("@kiosk_external_app_background_image_enabled", "boolean"),
        Definition("@kiosk_external_app_background_image", "string"),
        Definition("@kiosk_external_app_background_position", "string"),
        Definition("@kiosk_auto_relaunch_app", "boolean"),
        Definition("@kiosk_overlay_button_visible", "boolean"),
        Definition("@kiosk_overlay_button_position", "string"),
        Definition("@kiosk_pin_max_attempts", "number"),
        Definition("@kiosk_status_bar_enabled", "boolean"),
        Definition("@kiosk_status_bar_on_overlay", "boolean"),
        Definition("@kiosk_status_bar_on_return", "boolean"),
        Definition("@kiosk_status_bar_show_battery", "boolean"),
        Definition("@kiosk_status_bar_show_wifi", "boolean"),
        Definition("@kiosk_status_bar_show_bluetooth", "boolean"),
        Definition("@kiosk_status_bar_show_volume", "boolean"),
        Definition("@kiosk_status_bar_show_time", "boolean"),
        Definition("@kiosk_status_bar_theme", "string"),
        Definition("@kiosk_external_app_test_mode", "boolean"),
        Definition("@kiosk_back_button_mode", "string"),
        Definition("@kiosk_back_button_timer_delay", "number"),
        Definition("@kiosk_keyboard_mode", "string"),
        Definition("@kiosk_pin_mode", "string"),
        Definition("@kiosk_url_rotation_enabled", "boolean"),
        Definition("@kiosk_url_rotation_list", "json"),
        Definition("@kiosk_url_rotation_interval", "number"),
        Definition("@kiosk_url_planner_enabled", "boolean"),
        Definition("@kiosk_url_planner_events", "json"),
        Definition("@kiosk_rest_api_enabled", "boolean"),
        Definition("@kiosk_rest_api_port", "number"),
        Definition("@kiosk_rest_api_allow_control", "boolean"),
        Definition("@kiosk_allow_power_button", "boolean"),
        Definition("@kiosk_block_factory_reset", "boolean"),
        Definition("@kiosk_allow_notifications", "boolean"),
        Definition("@kiosk_allow_system_info", "boolean"),
        Definition("@kiosk_return_tap_count", "number"),
        Definition("@kiosk_return_tap_timeout", "number"),
        Definition("@kiosk_return_mode", "string"),
        Definition("@kiosk_return_button_position", "string"),
        Definition("@kiosk_home_button_enabled", "boolean"),
        Definition("@kiosk_home_button_position", "string"),
        Definition("@kiosk_volume_up_5tap_enabled", "boolean"),
        Definition("@kiosk_blocking_overlays_enabled", "boolean"),
        Definition("@kiosk_blocking_overlays_regions", "json"),
        Definition("@motion_camera_position", "string"),
        Definition("@kiosk_webview_back_button_enabled", "boolean"),
        Definition("@kiosk_webview_back_button_x_percent", "number"),
        Definition("@kiosk_webview_back_button_y_percent", "number"),
        Definition("@kiosk_auto_brightness_enabled", "boolean"),
        Definition("@kiosk_auto_brightness_min", "number"),
        Definition("@kiosk_auto_brightness_max", "number"),
        Definition("@kiosk_auto_brightness_offset", "number"),
        Definition("@kiosk_auto_brightness_update_interval", "number"),
        Definition("@kiosk_auto_brightness_saved_manual", "number"),
        Definition("@brightness_management_enabled", "boolean"),
        Definition("@kiosk_screen_scheduler_enabled", "boolean"),
        Definition("@kiosk_screen_scheduler_rules", "json"),
        Definition("@kiosk_screen_scheduler_wake_on_touch", "boolean"),
        Definition("@kiosk_keep_screen_on", "boolean"),
        Definition("@kiosk_auto_wake_on_screen_off", "boolean"),
        Definition("@kiosk_inactivity_return_enabled", "boolean"),
        Definition("@kiosk_inactivity_return_delay", "number"),
        Definition("@kiosk_inactivity_return_reset_on_nav", "boolean"),
        Definition("@kiosk_inactivity_return_clear_cache", "boolean"),
        Definition("@kiosk_inactivity_return_scroll_top", "boolean"),
        Definition("@kiosk_url_filter_enabled", "boolean"),
        Definition("@kiosk_url_filter_mode", "string"),
        Definition("@kiosk_url_filter_list", "json"),
        Definition("@kiosk_url_filter_show_feedback", "boolean"),
        Definition("@kiosk_pdf_viewer_enabled", "boolean"),
        Definition("@kiosk_print_enabled", "boolean"),
        Definition("@kiosk_print_paper_size", "string"),
        Definition("@kiosk_webview_zoom_level", "number"),
        Definition("@kiosk_webview_zoom_mode", "string"),
        Definition("@kiosk_disable_user_zoom", "boolean"),
        Definition("@kiosk_custom_user_agent", "string"),
        Definition("@kiosk_pause_web_media_when_hidden", "boolean"),
        Definition("@kiosk_mqtt_enabled", "boolean"),
        Definition("@kiosk_mqtt_broker_url", "string"),
        Definition("@kiosk_mqtt_port", "number"),
        Definition("@kiosk_mqtt_username", "string"),
        Definition("@kiosk_mqtt_client_id", "string"),
        Definition("@kiosk_mqtt_base_topic", "string"),
        Definition("@kiosk_mqtt_discovery_prefix", "string"),
        Definition("@kiosk_mqtt_status_interval", "number"),
        Definition("@kiosk_mqtt_allow_control", "boolean"),
        Definition("@kiosk_mqtt_device_name", "string"),
        Definition("@kiosk_mqtt_motion_always_on", "boolean"),
        Definition("@kiosk_beta_updates_enabled", "boolean"),
        Definition("@kiosk_managed_apps", "json"),
        Definition("@kiosk_app_groups", "json"),
        Definition("@kiosk_blocked_apps", "json"),
        Definition("@kiosk_media_player_items", "json"),
        Definition("@kiosk_media_player_autoplay", "boolean"),
        Definition("@kiosk_media_player_loop", "boolean"),
        Definition("@kiosk_media_player_shuffle", "boolean"),
        Definition("@kiosk_media_player_image_duration", "number"),
        Definition("@kiosk_media_player_show_controls", "boolean"),
        Definition("@kiosk_media_player_fit_mode", "string"),
        Definition("@kiosk_media_player_bg_color", "string"),
        Definition("@kiosk_media_player_transition", "boolean"),
        Definition("@kiosk_media_player_transition_duration", "number"),
        Definition("@kiosk_media_player_mute", "boolean"),
        Definition("@screensaver_delay", "number"),
        Definition("@motion_detection_enabled", "boolean"),
        Definition("@motion_sensitivity", "number"),
        Definition("@motion_delay", "number"),
        Definition("@kiosk_dashboard_mode_enabled", "boolean"),
        Definition("@kiosk_dashboard_tiles", "json"),
        Definition("@kiosk_lockscreen_controls_enabled", "boolean"),
        Definition("@kiosk_lockscreen_wifi_enabled", "boolean"),
        Definition("@kiosk_lockscreen_bluetooth_enabled", "boolean"),
        Definition("@kiosk_lockscreen_emergency_call_enabled", "boolean"),
        Definition("@kiosk_lockscreen_audio_enabled", "boolean"),
        Definition("@kiosk_lockscreen_flashlight_enabled", "boolean"),
        Definition("@kiosk_lockscreen_brightness_enabled", "boolean"),
        Definition("@kiosk_lockscreen_rotation_lock_enabled", "boolean"),
        Definition("@kiosk_http_basic_auth_username", "string"),
    )
    private val definitionsByKey = definitions.associateBy { it.key }

    @Synchronized
    fun catalog(context: Context): JSONObject {
        val stored = readStoredValues(context)
        return JSONObject().apply {
            put("settings", JSONArray().apply {
                definitions.sortedWith(compareBy({ categoryFor(it.key) }, { labelFor(it.key) }))
                    .forEach { definition ->
                        val raw = stored[definition.key]
                        put(JSONObject().apply {
                            put("key", definition.key)
                            put("label", labelFor(definition.key))
                            put("category", categoryFor(definition.key))
                            put("type", definition.type)
                            put("isSet", raw != null)
                            if (raw != null) put("value", decode(definition, raw))
                        })
                    }
            })
            put("secretSettingsExcluded", true)
            put("restartRequiredAfterWrite", true)
        }
    }

    @Synchronized
    fun update(context: Context, setValues: JSONObject, unsetKeys: JSONArray): JSONObject {
        val encodedValues = linkedMapOf<String, String>()
        val unset = linkedSetOf<String>()

        val setIterator = setValues.keys()
        while (setIterator.hasNext()) {
            val key = setIterator.next()
            val definition = definitionsByKey[key]
                ?: throw IllegalArgumentException("Setting is not remotely configurable: $key")
            encodedValues[key] = encode(definition, setValues.get(key))
        }
        for (index in 0 until unsetKeys.length()) {
            val key = unsetKeys.optString(index, "")
            if (key.isBlank()) throw IllegalArgumentException("unset must contain setting keys")
            if (!definitionsByKey.containsKey(key)) {
                throw IllegalArgumentException("Setting is not remotely configurable: $key")
            }
            if (encodedValues.containsKey(key)) {
                throw IllegalArgumentException("A setting cannot be set and unset in the same request: $key")
            }
            unset.add(key)
        }

        val kioskRequested = encodedValues["@kiosk_enabled"] == "true"
        val hiddenRequested = encodedValues["@kiosk_hidden_mode_enabled"] == "true"
        if (kioskRequested && hiddenRequested) {
            throw IllegalArgumentException("Lock Mode and Hidden Mode cannot both be enabled")
        }
        if (hiddenRequested) {
            encodedValues["@kiosk_enabled"] = "false"
            unset.remove("@kiosk_enabled")
        } else if (kioskRequested) {
            encodedValues["@kiosk_hidden_mode_enabled"] = "false"
            unset.remove("@kiosk_hidden_mode_enabled")
        }

        val path = context.getDatabasePath(DATABASE_NAME).absolutePath
        SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE).use { database ->
            database.beginTransaction()
            try {
                encodedValues.forEach { (key, value) ->
                    val row = ContentValues().apply {
                        put("key", key)
                        put("value", value)
                    }
                    check(
                        database.insertWithOnConflict(
                            TABLE_NAME,
                            null,
                            row,
                            SQLiteDatabase.CONFLICT_REPLACE,
                        ) != -1L
                    ) { "Could not save $key" }
                }
                unset.forEach { key ->
                    database.delete(TABLE_NAME, "key = ?", arrayOf(key))
                }
                database.setTransactionSuccessful()
            } finally {
                database.endTransaction()
            }
        }

        val changed = encodedValues.keys + unset
        val backgroundPolicyKeys = setOf(
            "@kiosk_enabled",
            "@kiosk_hidden_mode_enabled",
            "@kiosk_app_blocking_enabled",
            "@kiosk_blocked_apps",
        )
        var backgroundPolicyWarning: String? = null
        if (changed.any { it in backgroundPolicyKeys }) {
            runCatching {
                val blocked = BlockedAppPolicy.reconcile(context)
                val expected = if (BlockedAppPolicy.isAppBlockingEnabled(context)) {
                    BlockedAppPolicy.configuredInstalledPackages(context)
                } else {
                    emptySet()
                }
                val refused = expected - blocked
                if (refused.isNotEmpty()) {
                    backgroundPolicyWarning =
                        "Android refused to hide or suspend: ${refused.sorted().joinToString(", ")}"
                }
                KioskWatchdogService.reconcileService(context)
            }.onFailure { error ->
                backgroundPolicyWarning = "Background policy reconciliation failed: ${error.message}"
            }
        }
        return JSONObject().apply {
            put("updated", JSONArray(encodedValues.keys.toList()))
            put("unset", JSONArray(unset.toList()))
            put("restartRequired", changed.isNotEmpty())
            put("warnings", JSONArray().apply {
                if (changed.isNotEmpty()) {
                    put("Changes are saved. Restart the FreeKiosk UI to apply them.")
                }
                backgroundPolicyWarning?.let { put(it) }
                if ("@kiosk_enabled" in changed) {
                    put("Lock Mode changes take effect after the FreeKiosk UI restarts.")
                }
                if (changed.any { it.startsWith("@kiosk_rest_api_") }) {
                    put("REST API changes may move or stop this endpoint after restart.")
                }
            })
        }
    }

    private fun readStoredValues(context: Context): Map<String, String> {
        val allowed = definitionsByKey.keys
        val result = mutableMapOf<String, String>()
        val path = context.getDatabasePath(DATABASE_NAME).absolutePath
        SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY).use { database ->
            database.query(TABLE_NAME, arrayOf("key", "value"), null, null, null, null, null).use { cursor ->
                while (cursor.moveToNext()) {
                    val key = cursor.getString(0)
                    if (key in allowed) result[key] = cursor.getString(1)
                }
            }
        }
        return result
    }

    private fun encode(definition: Definition, value: Any): String = when (definition.type) {
        "boolean" -> {
            require(value is Boolean) { "${definition.key} requires a boolean" }
            value.toString()
        }
        "number" -> {
            require(value is Number) { "${definition.key} requires a number" }
            JSONObject.numberToString(value)
        }
        "json" -> {
            require(value is JSONObject || value is JSONArray) {
                "${definition.key} requires a JSON object or array"
            }
            value.toString()
        }
        else -> {
            require(value is String) { "${definition.key} requires a string" }
            value
        }
    }

    private fun decode(definition: Definition, raw: String): Any = try {
        when (definition.type) {
            "boolean" -> when (raw) {
                "true" -> true
                "false" -> false
                else -> raw.toBooleanStrict()
            }
            "number" -> raw.toDouble()
            "json" -> JSONTokener(raw).nextValue()
            else -> raw
        }
    } catch (_: Exception) {
        // Keep a malformed legacy value visible and editable instead of failing the entire catalog.
        raw
    }

    private fun categoryFor(key: String): String = when {
        key.startsWith("@screensaver_") -> "Screensaver"
        key.startsWith("@motion_") -> "Motion Detection"
        key.contains("mqtt_") -> "MQTT"
        key.contains("rest_api_") -> "Remote API"
        key.contains("media_player_") -> "Media Player"
        key.contains("auto_brightness_") || key == "@default_brightness" ||
            key == "@brightness_management_enabled" -> "Brightness"
        key.contains("screen_scheduler_") -> "Screen Schedule"
        key.contains("status_bar_") || key.contains("lockscreen_") -> "Status & Lock Screen"
        key.contains("url_") || key.contains("webview_") || key.contains("print_") ||
            key.contains("pdf_") || key.contains("http_basic_auth_") -> "Web & Navigation"
        key.contains("external_app_") || key.contains("managed_apps") ||
            key.contains("overlay_") || key.contains("dashboard_") ||
            key == "@kiosk_display_mode" -> "Apps & Display"
        key.contains("return_") || key.contains("home_button_") ||
            key.contains("volume_up_5tap") || key.contains("back_button_") ||
            key.contains("keyboard_mode") || key.contains("pin_mode") ||
            key.contains("pin_max_attempts") -> "Access & Escape"
        key.contains("allow_") || key.contains("block_factory") || key.contains("blocked_apps") ||
            key.contains("default_launcher") || key.contains("screen_lock") ||
            key == "@kiosk_enabled" -> "Lock Mode & Security"
        else -> "General"
    }

    private fun labelFor(key: String): String {
        val words = key.removePrefix("@")
            .removePrefix("kiosk_")
            .replace('_', ' ')
            .split(' ')
        return words.joinToString(" ") { word ->
            when (word.lowercase()) {
                "api" -> "API"
                "http" -> "HTTP"
                "mqtt" -> "MQTT"
                "pdf" -> "PDF"
                "pin" -> "PIN"
                "url" -> "URL"
                "wifi" -> "Wi-Fi"
                else -> word.replaceFirstChar { it.uppercase() }
            }
        }
    }
}
