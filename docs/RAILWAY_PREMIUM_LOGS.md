# Railway premium logs

Obsidra writes structured JSON logs to stdout/stderr, so Railway can show and filter them in the deployment logs.

## How to filter

Search this marker in Railway logs:

```text
OBSIDRA_PREMIUM_LOG
```

Useful event filters:

```text
event:launcher_starting
event:child_spawned
event:api_started
event:api_heartbeat
event:websocket_connected
event:risk_approved
event:risk_rejected
event:order_intent_created
event:order_opened
event:order_failed
event:order_closed
event:metrics_collected
event:health_server_started
event:health_check_unhealthy
```

## Heartbeat interval

Set this Railway variable if you want more or fewer API heartbeat logs:

```text
PREMIUM_LOG_HEARTBEAT_SECONDS=60
```

Set it to `0` to disable the API heartbeat logs.

## What the logs include

- Railway deployment/service metadata when Railway exposes it.
- Uptime in seconds.
- API port and WebSocket connection count.
- Risk decisions with symbol, exchange, score, confidence, regime and rejection reason.
- Order lifecycle logs: intent, submit, opened, failed, close intent, closed.
- Metrics snapshots: PnL, win rate, open positions, exposure, drawdown, ML accuracy.
- Health server status.

Sensitive values are redacted by the shared logger before writing logs.
