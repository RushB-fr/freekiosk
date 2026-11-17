package com.freekiosk

/** Minimal IPv4/UDP DNS codec used by the local network-protection VPN. */
object DnsPacketCodec {
    data class Query(
        val sourceAddress: ByteArray,
        val destinationAddress: ByteArray,
        val sourcePort: Int,
        val destinationPort: Int,
        val dnsPayload: ByteArray,
        val questionEnd: Int,
        val hostName: String,
    )

    fun parseQuery(packet: ByteArray, length: Int): Query? {
        if (length < 40 || (packet[0].toInt() ushr 4) != 4) return null
        val ipHeaderLength = (packet[0].toInt() and 0x0f) * 4
        if (ipHeaderLength < 20 || length < ipHeaderLength + 20) return null
        if ((packet[9].toInt() and 0xff) != 17) return null // UDP only
        val fragmentField = readU16(packet, 6)
        if ((fragmentField and 0x1fff) != 0) return null

        val totalLength = readU16(packet, 2).coerceAtMost(length)
        val udpOffset = ipHeaderLength
        val udpLength = readU16(packet, udpOffset + 4)
        if (udpLength < 20 || udpOffset + udpLength > totalLength) return null
        val destinationPort = readU16(packet, udpOffset + 2)
        if (destinationPort != 53) return null

        val dnsOffset = udpOffset + 8
        val dnsLength = udpLength - 8
        if (dnsLength < 17 || dnsOffset + dnsLength > length) return null
        val payload = packet.copyOfRange(dnsOffset, dnsOffset + dnsLength)
        if ((payload[2].toInt() and 0x80) != 0 || readU16(payload, 4) < 1) return null

        val labels = mutableListOf<String>()
        var cursor = 12
        while (cursor < payload.size) {
            val labelLength = payload[cursor].toInt() and 0xff
            cursor += 1
            if (labelLength == 0) break
            if ((labelLength and 0xc0) != 0 || labelLength > 63 || cursor + labelLength > payload.size) {
                return null
            }
            labels += payload.copyOfRange(cursor, cursor + labelLength)
                .toString(Charsets.US_ASCII)
            cursor += labelLength
        }
        if (labels.isEmpty() || cursor + 4 > payload.size) return null

        return Query(
            sourceAddress = packet.copyOfRange(12, 16),
            destinationAddress = packet.copyOfRange(16, 20),
            sourcePort = readU16(packet, udpOffset),
            destinationPort = destinationPort,
            dnsPayload = payload,
            questionEnd = cursor + 4,
            hostName = labels.joinToString(".").lowercase().trimEnd('.'),
        )
    }

    fun buildDnsError(query: Query, responseCode: Int): ByteArray {
        val response = query.dnsPayload.copyOf(query.questionEnd)
        val originalFlags = readU16(response, 2)
        val flags = (originalFlags or 0x8080) and 0xfff0 or (responseCode and 0x0f)
        writeU16(response, 2, flags)
        writeU16(response, 6, 0) // answers
        writeU16(response, 8, 0) // authority
        writeU16(response, 10, 0) // additional
        return response
    }

    fun buildIpv4UdpResponse(query: Query, dnsResponse: ByteArray): ByteArray {
        val udpLength = 8 + dnsResponse.size
        val totalLength = 20 + udpLength
        val packet = ByteArray(totalLength)
        packet[0] = 0x45
        packet[1] = 0
        writeU16(packet, 2, totalLength)
        writeU16(packet, 4, 0)
        writeU16(packet, 6, 0x4000)
        packet[8] = 64
        packet[9] = 17
        query.destinationAddress.copyInto(packet, 12)
        query.sourceAddress.copyInto(packet, 16)
        writeU16(packet, 20, query.destinationPort)
        writeU16(packet, 22, query.sourcePort)
        writeU16(packet, 24, udpLength)
        writeU16(packet, 26, 0) // IPv4 permits a zero UDP checksum.
        dnsResponse.copyInto(packet, 28)
        writeU16(packet, 10, checksum(packet, 0, 20))
        return packet
    }

    private fun checksum(data: ByteArray, offset: Int, length: Int): Int {
        var sum = 0L
        var cursor = offset
        val end = offset + length
        while (cursor + 1 < end) {
            sum += ((data[cursor].toInt() and 0xff) shl 8) or
                (data[cursor + 1].toInt() and 0xff)
            cursor += 2
        }
        if (cursor < end) sum += (data[cursor].toInt() and 0xff) shl 8
        while (sum ushr 16 != 0L) sum = (sum and 0xffff) + (sum ushr 16)
        return sum.inv().toInt() and 0xffff
    }

    private fun readU16(data: ByteArray, offset: Int): Int =
        ((data[offset].toInt() and 0xff) shl 8) or (data[offset + 1].toInt() and 0xff)

    private fun writeU16(data: ByteArray, offset: Int, value: Int) {
        data[offset] = (value ushr 8).toByte()
        data[offset + 1] = value.toByte()
    }
}
