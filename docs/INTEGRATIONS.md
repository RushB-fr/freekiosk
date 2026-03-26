<div align="center">

# 🔌 Integrations

_Connect FreeKiosk to your automation stack with REST and MQTT, or both together._

<p>
  <a href="README.md">Docs Home</a> •
  <a href="rest-api.md">REST API</a> •
  <a href="MQTT.md">MQTT</a>
</p>

</div>

> [!IMPORTANT]
> REST and MQTT can run simultaneously on the same device.

## 🤖 Home Assistant and Automation

FreeKiosk supports two main integration channels:

- REST API for request/response control
- MQTT for push-based telemetry and commands

Both can run simultaneously.

| Channel | Best when | Reference |
|---|---|---|
| REST API | You want request/response control on demand | [REST API Documentation](rest-api.md) |
| MQTT | You want push telemetry + Home Assistant discovery | [MQTT Documentation](MQTT.md) |

## REST API

Highlights:

- 40+ endpoints
- Device status, sensors, controls, and navigation
- Optional API key with `X-Api-Key`
- Screenshot and camera endpoints available

Reference:

- [REST API Documentation](rest-api.md)

## MQTT

Highlights:

- MQTT v5 / v3.1.1
- Home Assistant auto-discovery
- Availability via LWT
- Realtime status publishing
- Remote commands and control entities

Reference:

- [MQTT Documentation](MQTT.md)

## Headless Setup

You can provision integrations without UI using ADB intent parameters.

Reference:

- [ADB Configuration Guide](adb-configuration.md)
