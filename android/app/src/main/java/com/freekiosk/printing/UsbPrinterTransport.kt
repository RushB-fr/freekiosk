package com.freekiosk.printing

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.freekiosk.DebugLog

/**
 * USB printers, over the USB Printer Class (07h).
 *
 * Targeting the class rather than a list of vendor ids is what makes unfamiliar printers work.
 * With no printer-class interface attached, the first interface of any class with a bulk OUT
 * endpoint is driven instead, and answers no status.
 */
class UsbPrinterTransport(private val context: Context) : PrinterTransport {

    companion object {
        private const val TAG = "UsbPrinterTransport"

        private const val ACTION_USB_PERMISSION = "com.freekiosk.printing.USB_PERMISSION"

        private const val REQ_GET_DEVICE_ID = 0
        private const val REQ_GET_PORT_STATUS = 1
        private const val REQ_TYPE_CLASS_INTERFACE_IN = 0xA1
        private const val PORT_STATUS_PAPER_EMPTY = 0x20

        private const val CONTROL_TIMEOUT_MS = 1_000
        private const val WRITE_TIMEOUT_MS = 5_000
        private const val CHUNK_BYTES = 4_096
    }

    override val kind: String = "usb"

    private val usbManager: UsbManager?
        get() = context.getSystemService(Context.USB_SERVICE) as? UsbManager

    private data class Target(
        val device: UsbDevice,
        val iface: UsbInterface,
        val out: UsbEndpoint,
        val isPrinterClass: Boolean,
    )

    override fun find(): PrinterDescription? = findTarget()?.let { describe(it, connection = null) }

    override fun hasPermission(): Boolean {
        val target = findTarget() ?: return false
        return usbManager?.hasPermission(target.device) == true
    }

    override fun requestPermission(callback: (granted: Boolean) -> Unit) {
        val manager = usbManager
        val target = findTarget()
        if (manager == null || target == null) {
            callback(false)
            return
        }
        if (manager.hasPermission(target.device)) {
            callback(true)
            return
        }
        registerPermissionReceiver(callback)
        manager.requestPermission(target.device, permissionIntent())
    }

    override fun status(): PrinterStatus {
        val target = findTarget()
            ?: return PrinterStatus(PrinterStatus.State.NO_PRINTER, PaperState.UNKNOWN, null)

        val manager = usbManager
        if (manager == null || !manager.hasPermission(target.device)) {
            return PrinterStatus(
                PrinterStatus.State.NO_PERMISSION,
                PaperState.UNKNOWN,
                describe(target, connection = null),
            )
        }

        var connection: UsbDeviceConnection? = null
        return try {
            connection = manager.openDevice(target.device)
                ?: return PrinterStatus(PrinterStatus.State.ERROR, PaperState.UNKNOWN, describe(target, null))
            val paper = readPaperState(connection, target)
            val state =
                if (paper == PaperState.OUT) PrinterStatus.State.PAPER_OUT else PrinterStatus.State.READY
            PrinterStatus(state, paper, describe(target, connection))
        } catch (e: Exception) {
            DebugLog.errorProduction(TAG, "Status failed: ${e.message}")
            PrinterStatus(PrinterStatus.State.ERROR, PaperState.UNKNOWN, describe(target, null))
        } finally {
            connection?.close()
        }
    }

    override fun write(bytes: ByteArray) {
        val target = findTarget()
            ?: throw PrinterException(PrinterException.NO_PRINTER, "No USB printer attached")
        val manager = usbManager
            ?: throw PrinterException(PrinterException.OPEN_FAILED, "No USB service")
        if (!manager.hasPermission(target.device)) {
            throw PrinterException(PrinterException.NO_PERMISSION, "No permission for the USB printer")
        }

        val connection = manager.openDevice(target.device)
            ?: throw PrinterException(PrinterException.OPEN_FAILED, "Could not open the USB printer")
        try {
            if (!connection.claimInterface(target.iface, true)) {
                throw PrinterException(PrinterException.OPEN_FAILED, "Could not claim the printer interface")
            }
            // Before writing, not after: a printer out of paper swallows the job silently, and
            // reporting success would be a lie the web app passes on to whoever is waiting for it.
            if (readPaperState(connection, target) == PaperState.OUT) {
                throw PrinterException(PrinterException.PAPER_OUT, "The printer is out of paper")
            }
            writeChunks(connection, target, bytes)
        } finally {
            runCatching { connection.releaseInterface(target.iface) }
            connection.close()
        }
    }

    /**
     * Resolved per job, never cached: a USB-C adapter with power passthrough re-enumerates its
     * devices whenever power is plugged or unplugged, leaving a held device silently dead.
     */
    private fun findTarget(): Target? {
        val devices = usbManager?.deviceList?.values ?: return null
        var fallback: Target? = null

        for (device in devices) {
            for (i in 0 until device.interfaceCount) {
                val iface = device.getInterface(i)
                val out = bulkOutEndpoint(iface) ?: continue
                val isPrinter = iface.interfaceClass == UsbConstants.USB_CLASS_PRINTER
                val target = Target(device, iface, out, isPrinter)
                if (isPrinter) return target
                if (fallback == null) fallback = target
            }
        }
        return fallback
    }

    private fun bulkOutEndpoint(iface: UsbInterface): UsbEndpoint? {
        for (e in 0 until iface.endpointCount) {
            val endpoint = iface.getEndpoint(e)
            if (endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK &&
                endpoint.direction == UsbConstants.USB_DIR_OUT
            ) {
                return endpoint
            }
        }
        return null
    }

    private fun registerPermissionReceiver(callback: (granted: Boolean) -> Unit) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action != ACTION_USB_PERMISSION) return
                runCatching { context.unregisterReceiver(this) }
                // Falls back to the live answer: the extra is missing if the broadcast could not be
                // filled in, which would otherwise read as a denial of a permission we now hold.
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                callback(granted || hasPermission())
            }
        }
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(ACTION_USB_PERMISSION),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    /**
     * Must be MUTABLE: the framework fills the result extras into this intent when it sends it, and
     * an immutable one arrives with no EXTRA_PERMISSION_GRANTED at all.
     */
    private fun permissionIntent(): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        return PendingIntent.getBroadcast(
            context,
            0,
            Intent(ACTION_USB_PERMISSION).setPackage(context.packageName),
            flags,
        )
    }

    private fun writeChunks(connection: UsbDeviceConnection, target: Target, bytes: ByteArray) {
        var offset = 0
        while (offset < bytes.size) {
            val length = minOf(CHUNK_BYTES, bytes.size - offset)
            val sent = connection.bulkTransfer(target.out, bytes, offset, length, WRITE_TIMEOUT_MS)
            if (sent <= 0) {
                throw PrinterException(
                    PrinterException.WRITE_FAILED,
                    "Printer stopped accepting data after $offset of ${bytes.size} bytes",
                )
            }
            offset += sent
        }
        DebugLog.d(TAG, "Wrote ${bytes.size} bytes to ${target.device.deviceName}")
    }

    private fun readPaperState(connection: UsbDeviceConnection, target: Target): PaperState {
        if (!target.isPrinterClass) return PaperState.UNKNOWN
        val buffer = ByteArray(1)
        val read = connection.controlTransfer(
            REQ_TYPE_CLASS_INTERFACE_IN,
            REQ_GET_PORT_STATUS,
            0,
            target.iface.id,
            buffer,
            buffer.size,
            CONTROL_TIMEOUT_MS,
        )
        if (read != 1) return PaperState.UNKNOWN
        val paperEmpty = (buffer[0].toInt() and PORT_STATUS_PAPER_EMPTY) != 0
        return if (paperEmpty) PaperState.OUT else PaperState.OK
    }

    /** IEEE 1284: a big-endian length, then "MFG:Xprinter;MDL:XP-58;CMD:ESC/POS;". */
    private fun readDeviceId(connection: UsbDeviceConnection, target: Target): Map<String, String> {
        if (!target.isPrinterClass) return emptyMap()
        val buffer = ByteArray(1024)
        val read = connection.controlTransfer(
            REQ_TYPE_CLASS_INTERFACE_IN,
            REQ_GET_DEVICE_ID,
            0,
            target.iface.id shl 8,
            buffer,
            buffer.size,
            CONTROL_TIMEOUT_MS,
        )
        if (read < 3) return emptyMap()

        val declared = ((buffer[0].toInt() and 0xFF) shl 8) or (buffer[1].toInt() and 0xFF)
        val length = minOf(declared - 2, read - 2).coerceAtLeast(0)
        if (length == 0) return emptyMap()

        return String(buffer, 2, length, Charsets.US_ASCII)
            .split(';')
            .mapNotNull { field ->
                val parts = field.split(':', limit = 2)
                if (parts.size == 2 && parts[0].isNotBlank()) {
                    parts[0].trim().uppercase() to parts[1].trim()
                } else {
                    null
                }
            }
            .toMap()
    }

    private fun describe(target: Target, connection: UsbDeviceConnection?): PrinterDescription {
        val id = connection?.let { runCatching { readDeviceId(it, target) }.getOrDefault(emptyMap()) }
            ?: emptyMap()
        val manufacturer = id["MFG"] ?: id["MANUFACTURER"]
        val model = id["MDL"] ?: id["MODEL"]

        return PrinterDescription(
            kind = kind,
            displayName = displayName(target, manufacturer, model),
            vendorId = target.device.vendorId,
            productId = target.device.productId,
            manufacturer = manufacturer,
            model = model,
            commandSet = id["CMD"] ?: id["COMMAND SET"],
        )
    }

    private fun displayName(target: Target, manufacturer: String?, model: String?): String {
        val reported = listOfNotNull(manufacturer, model)
        if (reported.isNotEmpty()) return reported.joinToString(" ")
        return runCatching { target.device.productName }.getOrNull()
            ?: "USB printer ${String.format("%04x:%04x", target.device.vendorId, target.device.productId)}"
    }
}
