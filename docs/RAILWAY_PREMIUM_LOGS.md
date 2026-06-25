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
event:engine_started
event:engine_heartbeat
event:market_data_warmed
event:signal_evaluated
event:signal_generated
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

For the trading-engine heartbeat:

```text
ENGINE_LOG_HEARTBEAT_SECONDS=60
```

Set it to `0` to disable it. Each heartbeat reports bot status, open positions,
active strategies, current prices, funding rates, data age, candle-buffer sizes,
market regime and circuit-breaker state.

## Understanding signal logs

Every completed 15-minute evaluation emits `signal_evaluated`. When no order is
created, the `reason` field explains why:

- `INSUFFICIENT_DATA`
- `NO_TREND`
- `CIRCUIT_BREAKER`
- `INDICATORS_NOT_READY`
- `VOLATILITY_TOO_HIGH`
- `FUNDING_FILTER`
- `SCORE_BELOW_THRESHOLD`
- `RANGING_MARKET`

When a candidate passes, Railway shows `SIGNAL_READY`, followed by
`signal_generated`, risk approval/rejection and the order lifecycle.

## What the logs include

- Railway deployment/service metadata when Railway exposes it.
- Uptime in seconds.
- API port and WebSocket connection count.
- Risk decisions with symbol, exchange, score, confidence, regime and rejection reason.
- Order lifecycle logs: intent, submit, opened, failed, close intent, closed.
- Metrics snapshots: PnL, win rate, open positions, exposure, drawdown, ML accuracy.
- Health server status.

Sensitive values are redacted by the shared logger before writing logs.
