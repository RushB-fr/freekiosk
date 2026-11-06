package com.freekiosk.api

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** #346: the /api/autoBrightness routes of docs/rest-api.md, against a real server on a free port. */
class KioskHttpServerAutoBrightnessTest {
  private var server: KioskHttpServer? = null
  private val calls = mutableListOf<Pair<String, JSONObject?>>()

  private val status = JSONObject().put(
    "autoBrightness",
    JSONObject().put("enabled", true).put("min", 10).put("max", 100).put("currentLightLevel", 250.5)
  )

  private fun start(allowControl: Boolean = true): Int {
    val s = KioskHttpServer(
      port = 0,
      apiKey = null,
      allowControl = allowControl,
      statusProvider = { status },
      commandHandler = { command, params ->
        calls.add(command to params)
        JSONObject().put("executed", true).put("command", command)
      }
    )
    s.start()
    server = s
    return s.listeningPort
  }

  @After
  fun stop() {
    server?.stop()
  }

  private fun request(port: Int, method: String, path: String, body: String? = null): Pair<Int, JSONObject> {
    val c = URL("http://127.0.0.1:$port$path").openConnection() as HttpURLConnection
    c.requestMethod = method
    c.connectTimeout = 5000
    c.readTimeout = 5000
    if (body != null) {
      c.doOutput = true
      c.setRequestProperty("Content-Type", "application/json")
      c.outputStream.use { it.write(body.toByteArray()) }
    }
    val code = c.responseCode
    val text = (if (code < 400) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
    return code to JSONObject(text)
  }

  @Test
  fun `enable passes the levels and the offset that were sent`() {
    val port = start()
    val (code, json) = request(port, "POST", "/api/autoBrightness/enable", """{"min":5,"max":60,"offset":10}""")
    assertEquals(200, code)
    assertTrue(json.getBoolean("success"))
    assertEquals("autoBrightnessEnable", calls.single().first)
    val params = calls.single().second!!
    assertEquals(5, params.getInt("min"))
    assertEquals(60, params.getInt("max"))
    assertEquals(10, params.getInt("offset"))
  }

  @Test
  fun `enable without a body sends no levels, so the command applies its defaults`() {
    val port = start()
    val (code, _) = request(port, "POST", "/api/autoBrightness/enable")
    assertEquals(200, code)
    assertEquals("autoBrightnessEnable", calls.single().first)
    assertEquals(0, calls.single().second!!.length())
  }

  @Test
  fun `a level of 0 is passed as given`() {
    val port = start()
    request(port, "POST", "/api/autoBrightness/enable", """{"min":0}""")
    assertEquals(0, calls.single().second!!.getInt("min"))
  }

  @Test
  fun `a level outside 0 to 100 is refused and nothing runs`() {
    val port = start()
    for (body in listOf("""{"min":-1}""", """{"max":101}""", """{"offset":500}""", """{"max":"high"}""")) {
      val (code, json) = request(port, "POST", "/api/autoBrightness/enable", body)
      assertEquals(body, 400, code)
      assertEquals(false, json.getBoolean("success"))
    }
    assertTrue(calls.isEmpty())
  }

  @Test
  fun `disable runs the disable command`() {
    val port = start()
    val (code, _) = request(port, "POST", "/api/autoBrightness/disable")
    assertEquals(200, code)
    assertEquals("autoBrightnessDisable", calls.single().first)
    assertNull(calls.single().second)
  }

  @Test
  fun `enable and disable need remote control, reading does not`() {
    val port = start(allowControl = false)
    assertEquals(403, request(port, "POST", "/api/autoBrightness/enable", """{"min":5}""").first)
    assertEquals(403, request(port, "POST", "/api/autoBrightness/disable").first)
    assertTrue(calls.isEmpty())
    assertEquals(200, request(port, "GET", "/api/autoBrightness").first)
  }

  @Test
  fun `GET returns the auto-brightness block of the status`() {
    val port = start()
    val (code, json) = request(port, "GET", "/api/autoBrightness")
    assertEquals(200, code)
    val data = json.getJSONObject("data")
    assertEquals(true, data.getBoolean("enabled"))
    assertEquals(10, data.getInt("min"))
    assertEquals(100, data.getInt("max"))
    assertEquals(250.5, data.getDouble("currentLightLevel"), 0.0)
    assertTrue(calls.isEmpty())
  }
}
