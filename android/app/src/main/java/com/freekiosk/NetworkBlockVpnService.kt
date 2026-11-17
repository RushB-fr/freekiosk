package com.freekiosk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Split-tunnel, device-wide denylist implemented with Android's VpnService.
 *
 * Only DNS endpoints and configured destination prefixes enter this TUN. DNS queries are
 * answered with NXDOMAIN for blocked domain suffixes and proxied to the underlying resolver
 * otherwise. Packets targeting blocked IP/CIDR routes are deliberately discarded. All other
 * traffic keeps using the ordinary network without a userspace forwarding dependency.
 */
class NetworkBlockVpnService : VpnService() {
    companion object {
        const val ACTION_RELOAD = "com.freekiosk.action.RELOAD_NETWORK_PROTECTION"
        private const val TAG = "NetworkBlockVpn"
        private const val CHANNEL_ID = "freekiosk_network_protection"
        private const val NOTIFICATION_ID = 2003
        private const val REFRESH_INTERVAL_MS = 10 * 60 * 1_000L
        private const val VIRTUAL_DNS = "10.250.0.1"
        private const val VIRTUAL_ADDRESS = "10.250.0.2"

        @Volatile var isActive = false
            private set
        @Volatile var routedAddressCount = 0
            private set
        @Volatile var lastError: String? = null
            private set

        private val publicDnsEndpoints = listOf(
            "1.1.1.1", "1.0.0.1",
            "8.8.8.8", "8.8.4.4",
            "9.9.9.9", "149.112.112.112",
        )
    }

    private data class Route(val address: InetAddress, val prefix: Int) {
        val key: String = "${address.hostAddress}/$prefix"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val reloadExecutor = Executors.newSingleThreadExecutor()
    private val reloadGeneration = AtomicInteger(0)
    private val tunnelLock = Any()
    private var tunnel: ParcelFileDescriptor? = null
    private var readerThread: Thread? = null
    @Volatile private var running = false
    @Volatile private var blockedDomains: Set<String> = emptySet()
    private val lastBlockedLog = mutableMapOf<String, Long>()

    private val refreshRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            requestReload()
            mainHandler.postDelayed(this, REFRESH_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!NetworkBlockPolicy.isEnabled(this) || NetworkBlockPolicy.rules(this).isEmpty()) {
            closeTunnel()
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        startForeground(NOTIFICATION_ID, buildNotification(NetworkBlockPolicy.rules(this).size, 0))
        mainHandler.removeCallbacks(refreshRunnable)
        mainHandler.postDelayed(refreshRunnable, REFRESH_INTERVAL_MS)
        requestReload()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = super.onBind(intent)

    override fun onRevoke() {
        lastError = "Android revoked the Network Protection VPN"
        closeTunnel()
        super.onRevoke()
    }

    override fun onDestroy() {
        running = false
        mainHandler.removeCallbacks(refreshRunnable)
        reloadGeneration.incrementAndGet()
        closeTunnel()
        reloadExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun requestReload() {
        val generation = reloadGeneration.incrementAndGet()
        reloadExecutor.execute {
            try {
                val rules = NetworkBlockPolicy.rules(this)
                val domains = rules.filter { it.type == "domain" }.map { it.value }.toSet()
                val routes = linkedMapOf<String, Route>()

                fun addRoute(address: InetAddress, prefix: Int) {
                    val route = Route(address, prefix)
                    routes[route.key] = route
                }

                rules.filter { it.type == "ip" }.forEach { rule ->
                    NetworkBlockPolicy.parseRoute(rule.value)?.let { (address, prefix) ->
                        addRoute(address, prefix)
                    }
                }

                // Resolve exact roots for encrypted-DNS fallback. DNS filtering below remains
                // suffix-aware, so all subdomains are blocked when they use Android's resolver.
                domains.forEach { domain ->
                    val candidates = if (domain.startsWith("www.")) {
                        listOf(domain)
                    } else {
                        listOf(domain, "www.$domain")
                    }
                    candidates.forEach { host ->
                        runCatching { InetAddress.getAllByName(host).toList() }
                            .getOrDefault(emptyList())
                            .forEach { address ->
                                addRoute(address, if (address is Inet4Address) 32 else 128)
                            }
                    }
                }

                publicDnsEndpoints.forEach { endpoint ->
                    InetAddress.getByName(endpoint).let { addRoute(it, 32) }
                }

                if (!running || generation != reloadGeneration.get()) return@execute
                establishTunnel(domains, routes.values.toList())
            } catch (error: Exception) {
                lastError = error.message ?: error.javaClass.simpleName
                isActive = false
                DebugLog.errorProduction(TAG, "Could not establish Network Protection: $lastError")
                updateNotification(NetworkBlockPolicy.rules(this).size, 0)
            }
        }
    }

    private fun establishTunnel(domains: Set<String>, routes: List<Route>) {
        val builder = Builder()
            .setSession("FreeKiosk Network Protection")
            .setMtu(32767)
            .addAddress(VIRTUAL_ADDRESS, 32)
            .addAddress("fdfe:ca5e::2", 128)
            .addDnsServer(VIRTUAL_DNS)
            .addRoute(VIRTUAL_DNS, 32)
            .setBlocking(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) builder.setMetered(false)

        routes.forEach { route -> builder.addRoute(route.address, route.prefix) }
        val newTunnel = builder.establish()
            ?: throw IllegalStateException("Android refused to establish the filtering VPN")

        synchronized(tunnelLock) {
            val oldTunnel = tunnel
            tunnel = newTunnel
            blockedDomains = domains
            routedAddressCount = routes.size
            lastError = null
            isActive = true
            startReader(newTunnel)
            runCatching { oldTunnel?.close() }
        }
        DebugLog.d(TAG, "Network Protection active: domains=${domains.size}, routes=${routes.size}")
        updateNotification(NetworkBlockPolicy.rules(this).size, routes.size)
    }

    private fun startReader(descriptor: ParcelFileDescriptor) {
        readerThread = Thread({
            val input = FileInputStream(descriptor.fileDescriptor)
            val output = FileOutputStream(descriptor.fileDescriptor)
            val buffer = ByteArray(65535)
            try {
                while (running && tunnel === descriptor) {
                    val length = input.read(buffer)
                    if (length <= 0) continue
                    val query = DnsPacketCodec.parseQuery(buffer, length) ?: continue
                    val dnsResponse = if (isBlocked(query.hostName)) {
                        logBlocked(query.hostName)
                        DnsPacketCodec.buildDnsError(query, 3) // NXDOMAIN
                    } else {
                        forwardDns(query.dnsPayload)
                            ?: DnsPacketCodec.buildDnsError(query, 2) // SERVFAIL
                    }
                    output.write(DnsPacketCodec.buildIpv4UdpResponse(query, dnsResponse))
                }
            } catch (_: Exception) {
                // Closing/replacing the descriptor is the ordinary reload and shutdown path.
            } finally {
                runCatching { input.close() }
                runCatching { output.close() }
            }
        }, "FreeKiosk-DnsFilter").apply {
            isDaemon = true
            start()
        }
    }

    private fun isBlocked(hostName: String): Boolean = blockedDomains.any { domain ->
        hostName == domain || hostName.endsWith(".$domain")
    }

    private fun forwardDns(payload: ByteArray): ByteArray? {
        val upstream = findUpstreamDns()
        return try {
            DatagramSocket().use { socket ->
                if (!protect(socket)) return null
                socket.soTimeout = 2500
                socket.send(DatagramPacket(payload, payload.size, upstream, 53))
                val responseBuffer = ByteArray(65507)
                val response = DatagramPacket(responseBuffer, responseBuffer.size)
                socket.receive(response)
                response.data.copyOfRange(response.offset, response.offset + response.length)
            }
        } catch (_: SocketTimeoutException) {
            null
        } catch (_: Exception) {
            null
        }
    }

    private fun findUpstreamDns(): InetAddress {
        val connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivity.allNetworks.forEach { network ->
            val capabilities = connectivity.getNetworkCapabilities(network) ?: return@forEach
            if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ||
                !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                return@forEach
            }
            val dns = connectivity.getLinkProperties(network)?.dnsServers
                ?.firstOrNull { !it.isLoopbackAddress }
            if (dns != null) return dns
        }
        return InetAddress.getByName("1.1.1.1")
    }

    private fun logBlocked(hostName: String) {
        val now = System.currentTimeMillis()
        synchronized(lastBlockedLog) {
            if (now - (lastBlockedLog[hostName] ?: 0L) < 60_000L) return
            lastBlockedLog[hostName] = now
        }
        DebugLog.d(TAG, "Blocked DNS request: $hostName")
    }

    private fun closeTunnel() {
        running = false
        synchronized(tunnelLock) {
            runCatching { tunnel?.close() }
            tunnel = null
            readerThread = null
            blockedDomains = emptySet()
            routedAddressCount = 0
            isActive = false
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL_ID,
            "FreeKiosk Network Protection",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shows when device-wide website and IP blocking is active"
            setShowBadge(false)
            setSound(null, null)
            enableVibration(false)
        })
    }

    private fun buildNotification(ruleCount: Int, routeCount: Int): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            Intent(this, MainActivity::class.java).apply {
                action = KioskWatchdogService.ACTION_OPEN_PROTECTED_SETTINGS
                putExtra(KioskWatchdogService.EXTRA_OPEN_PROTECTED_SETTINGS, true)
                putExtra("voluntaryReturn", true)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val text = if (routeCount > 0) {
            "$ruleCount rule${if (ruleCount == 1) "" else "s"} active • Tap for parent settings"
        } else {
            "Starting $ruleCount network rule${if (ruleCount == 1) "" else "s"}"
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Network protection is active")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_hidden_mode_status)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setShowWhen(false)
            .setSilent(true)
            .build()
    }

    private fun updateNotification(ruleCount: Int, routeCount: Int) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(ruleCount, routeCount))
    }
}
