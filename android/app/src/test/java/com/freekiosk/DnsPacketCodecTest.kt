package com.freekiosk

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DnsPacketCodecTest {
    @Test
    fun cidrRoutesAreCanonicalizedToTheirNetworkAddress() {
        val (v4Address, v4Prefix) = requireNotNull(NetworkBlockPolicy.parseRoute("192.168.1.42/24"))
        assertEquals("192.168.1.0", v4Address.hostAddress)
        assertEquals(24, v4Prefix)

        val (v6Address, v6Prefix) = requireNotNull(NetworkBlockPolicy.parseRoute("2001:db8::1234/64"))
        assertEquals("2001:db8:0:0:0:0:0:0", v6Address.hostAddress)
        assertEquals(64, v6Prefix)
    }

    @Test
    fun parsesQueryAndBuildsNxdomainResponse() {
        val packet = buildQueryPacket("www.youtube.com")
        val query = DnsPacketCodec.parseQuery(packet, packet.size)!!
        assertEquals("www.youtube.com", query.hostName)
        assertEquals(4242, query.sourcePort)
        assertEquals(53, query.destinationPort)

        val dnsError = DnsPacketCodec.buildDnsError(query, 3)
        assertTrue((dnsError[2].toInt() and 0x80) != 0)
        assertEquals(3, dnsError[3].toInt() and 0x0f)
        assertEquals(0, readU16(dnsError, 6))

        val response = DnsPacketCodec.buildIpv4UdpResponse(query, dnsError)
        assertEquals(53, readU16(response, 20))
        assertEquals(4242, readU16(response, 22))
        assertEquals(listOf(10, 250, 0, 1), response.slice(12..15).map { it.toInt() and 0xff })
        assertEquals(listOf(10, 250, 0, 2), response.slice(16..19).map { it.toInt() and 0xff })
    }

    @Test
    fun ignoresNonDnsAndCompressedQueryNames() {
        val nonDns = buildQueryPacket("example.com").also { writeU16(it, 22, 443) }
        assertEquals(null, DnsPacketCodec.parseQuery(nonDns, nonDns.size))

        val compressed = buildQueryPacket("example.com").also { it[40] = 0xc0.toByte() }
        assertEquals(null, DnsPacketCodec.parseQuery(compressed, compressed.size))
    }

    private fun buildQueryPacket(host: String): ByteArray {
        val labels = host.split('.')
        val nameLength = labels.sumOf { 1 + it.length } + 1
        val dns = ByteArray(12 + nameLength + 4)
        writeU16(dns, 0, 0x1234)
        writeU16(dns, 2, 0x0100)
        writeU16(dns, 4, 1)
        var cursor = 12
        labels.forEach { label ->
            dns[cursor++] = label.length.toByte()
            label.toByteArray(Charsets.US_ASCII).copyInto(dns, cursor)
            cursor += label.length
        }
        dns[cursor++] = 0
        writeU16(dns, cursor, 1)
        writeU16(dns, cursor + 2, 1)

        val packet = ByteArray(28 + dns.size)
        packet[0] = 0x45
        writeU16(packet, 2, packet.size)
        packet[8] = 64
        packet[9] = 17
        byteArrayOf(10, 250.toByte(), 0, 2).copyInto(packet, 12)
        byteArrayOf(10, 250.toByte(), 0, 1).copyInto(packet, 16)
        writeU16(packet, 20, 4242)
        writeU16(packet, 22, 53)
        writeU16(packet, 24, 8 + dns.size)
        dns.copyInto(packet, 28)
        return packet
    }

    private fun readU16(data: ByteArray, offset: Int): Int =
        ((data[offset].toInt() and 0xff) shl 8) or (data[offset + 1].toInt() and 0xff)

    private fun writeU16(data: ByteArray, offset: Int, value: Int) {
        data[offset] = (value ushr 8).toByte()
        data[offset + 1] = value.toByte()
    }
}
