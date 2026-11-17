package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/** Device Owner lifecycle and device-encrypted configuration for Network Protection. */
object NetworkBlockPolicy {
    private const val PREFS_NAME = "network_block_policy"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_RULES = "rules_json"
    private const val KEY_LOCKDOWN = "lockdown"

    data class Rule(val type: String, val value: String)

    data class Status(
        val configured: Boolean,
        val deviceOwner: Boolean,
        val alwaysOn: Boolean,
        val lockdown: Boolean,
        val active: Boolean,
        val ruleCount: Int,
        val routedAddressCount: Int,
        val error: String? = null,
    )

    fun configure(context: Context, enabled: Boolean, rulesJson: String, lockdown: Boolean): Status {
        val normalizedRules = parseRules(rulesJson)
        if (enabled && normalizedRules.isEmpty()) {
            throw IllegalArgumentException("Add at least one valid domain, IP address, or CIDR rule")
        }
        val normalizedJson = rulesToJson(normalizedRules)
        val prefs = preferences(context)
        val oldEnabled = prefs.getBoolean(KEY_ENABLED, false)
        val oldRules = prefs.getString(KEY_RULES, "[]") ?: "[]"
        val oldLockdown = prefs.getBoolean(KEY_LOCKDOWN, false)

        prefs.edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putString(KEY_RULES, normalizedJson)
            .putBoolean(KEY_LOCKDOWN, lockdown)
            .commit()

        return try {
            reconcile(context)
        } catch (error: Exception) {
            prefs.edit()
                .putBoolean(KEY_ENABLED, oldEnabled)
                .putString(KEY_RULES, oldRules)
                .putBoolean(KEY_LOCKDOWN, oldLockdown)
                .commit()
            runCatching { reconcile(context) }
            throw error
        }
    }

    fun reconcile(context: Context): Status {
        val appContext = context.applicationContext
        val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(appContext, DeviceAdminReceiver::class.java)
        val owner = dpm.isDeviceOwnerApp(appContext.packageName)
        val enabled = isEnabled(appContext)
        val rules = rules(appContext)
        val lockdown = isLockdownEnabled(appContext)
        val currentAlwaysOn = if (owner) runCatching { dpm.getAlwaysOnVpnPackage(admin) }.getOrNull() else null

        if (!enabled || rules.isEmpty()) {
            if (owner && currentAlwaysOn == appContext.packageName) {
                dpm.setAlwaysOnVpnPackage(admin, null, false)
            }
            appContext.stopService(Intent(appContext, NetworkBlockVpnService::class.java))
            return status(appContext, owner, null)
        }

        if (!owner) throw SecurityException("Network Protection requires FreeKiosk to be Device Owner")
        if (currentAlwaysOn != null && currentAlwaysOn != appContext.packageName) {
            throw IllegalStateException("Another always-on VPN is already managed: $currentAlwaysOn")
        }

        dpm.setAlwaysOnVpnPackage(admin, appContext.packageName, lockdown)
        val intent = Intent(appContext, NetworkBlockVpnService::class.java).apply {
            action = NetworkBlockVpnService.ACTION_RELOAD
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appContext.startForegroundService(intent)
        } else {
            appContext.startService(intent)
        }
        return status(appContext, owner, null)
    }

    fun status(context: Context): Status {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(context, DeviceAdminReceiver::class.java)
        val owner = dpm.isDeviceOwnerApp(context.packageName)
        val current = if (owner) runCatching { dpm.getAlwaysOnVpnPackage(admin) }.getOrNull() else null
        return status(context, owner, current)
    }

    private fun status(context: Context, owner: Boolean, knownAlwaysOn: String?): Status {
        val current = knownAlwaysOn ?: if (owner) {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            runCatching {
                dpm.getAlwaysOnVpnPackage(ComponentName(context, DeviceAdminReceiver::class.java))
            }.getOrNull()
        } else null
        return Status(
            configured = isEnabled(context),
            deviceOwner = owner,
            alwaysOn = current == context.packageName,
            lockdown = isLockdownEnabled(context),
            active = NetworkBlockVpnService.isActive,
            ruleCount = rules(context).size,
            routedAddressCount = NetworkBlockVpnService.routedAddressCount,
            error = NetworkBlockVpnService.lastError,
        )
    }

    fun isEnabled(context: Context): Boolean =
        preferences(context).getBoolean(KEY_ENABLED, false)

    fun isLockdownEnabled(context: Context): Boolean =
        preferences(context).getBoolean(KEY_LOCKDOWN, false)

    fun rules(context: Context): List<Rule> = parseRules(
        preferences(context).getString(KEY_RULES, "[]") ?: "[]",
    )

    fun domainRules(context: Context): Set<String> = rules(context)
        .filter { it.type == "domain" }
        .map { it.value }
        .toSet()

    fun parseRoute(value: String): Pair<InetAddress, Int>? {
        val parts = value.split('/', limit = 2)
        if (parts.isEmpty() || parts[0].contains('%')) return null
        val looksV4 = parts[0].matches(Regex("^(?:\\d{1,3}\\.){3}\\d{1,3}$"))
        val looksV6 = parts[0].contains(':') && parts[0].matches(Regex("^[0-9a-fA-F:]+$"))
        if (!looksV4 && !looksV6) return null
        val address = runCatching { InetAddress.getByName(parts[0]) }.getOrNull() ?: return null
        val defaultPrefix = if (address is Inet4Address) 32 else 128
        val prefix = parts.getOrNull(1)?.toIntOrNull() ?: defaultPrefix
        if (address is Inet4Address && prefix !in 8..32) return null
        if (address is Inet6Address && prefix !in 16..128) return null
        val networkBytes = address.address.copyOf()
        for (bit in prefix until networkBytes.size * 8) {
            val byteIndex = bit / 8
            val mask = (0x80 ushr (bit % 8)).inv()
            networkBytes[byteIndex] = (networkBytes[byteIndex].toInt() and mask).toByte()
        }
        return InetAddress.getByAddress(networkBytes) to prefix
    }

    private fun parseRules(raw: String): List<Rule> {
        val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        val normalized = linkedMapOf<String, Rule>()
        val domainPattern = Regex("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$")
        for (index in 0 until array.length()) {
            val entry = array.opt(index)
            val rawValue = when (entry) {
                is String -> entry
                is JSONObject -> entry.optString("value")
                else -> ""
            }.trim().lowercase().removePrefix("*.").trimEnd('.')
            if (rawValue.isBlank()) continue
            val route = parseRoute(rawValue)
            val rule = when {
                route != null -> {
                    val normalizedValue = "${route.first.hostAddress}/${route.second}"
                    Rule("ip", normalizedValue)
                }
                domainPattern.matches(rawValue) -> Rule("domain", rawValue)
                else -> null
            } ?: continue
            normalized["${rule.type}:${rule.value}"] = rule
        }
        return normalized.values.toList()
    }

    private fun rulesToJson(rules: List<Rule>): String = JSONArray().apply {
        rules.forEach { rule ->
            put(JSONObject().put("type", rule.type).put("value", rule.value))
        }
    }.toString()

    private fun preferences(context: Context) = context.createDeviceProtectedStorageContext()
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
