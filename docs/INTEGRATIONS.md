# Integrations

## Home Assistant and Automation

FreeKiosk supports two main integration channels:

- REST API for request/response control
- MQTT for push-based telemetry and commands

Both can run simultaneously.

## REST API

Highlights:

- 40+ endpoints
- Device status, sensors, controls, and navigation
- Optional API key with `X-Api-Key`
- Screenshot and camera endpoints available

Reference:

- [REST API Documentation](REST_API.md)

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

- [ADB Configuration Guide](ADB_CONFIG.md)
