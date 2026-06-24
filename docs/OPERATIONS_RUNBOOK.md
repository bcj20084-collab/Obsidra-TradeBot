# Operations Runbook

This runbook is for paper trading, testnet operation and future live readiness.

## Daily checks

1. Open the dashboard and verify API health is green.
2. Confirm paper mode is enabled unless the live checklist has been approved.
3. Check the latest reconciliation report.
4. Confirm there are no reconciliation alerts.
5. Check daily PnL against the configured daily loss limit.
6. Review Discord and Telegram alert delivery.

## Before starting the engine

Run these checks from the repo root:

```bash
pnpm install --no-frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm typecheck
pnpm test
pnpm build
pnpm preflight
```

The engine should not be started if any step fails.

## Restart procedure

1. Pause new signal execution.
2. Let in-flight operations finish.
3. Restart the engine service.
4. Run reconciliation immediately after restart.
5. Resume only if exchange positions and DB positions match.

## Emergency stop procedure

Use emergency stop if any of these happen:

- Unexpected order appears.
- Exchange and DB disagree about open position state.
- Daily loss limit is breached.
- API keys are suspected to be leaked.
- Market data stalls or becomes inconsistent.

After emergency stop:

1. Leave trading paused.
2. Review logs and reconciliation report.
3. Rotate secrets if needed.
4. Do not resume until root cause is documented.

## Paper trading acceptance gate

Before any real-money setting:

- Minimum 30 days of paper trading.
- No unexplained reconciliation mismatch.
- No missing notifications.
- Daily loss guard verified.
- Emergency stop tested.
- Manual review of all environment variables.
- Exchange API keys restricted to minimum permissions.

## Current live status

Not live-ready yet. The project is a safe-first foundation and must remain in paper/testnet mode until the checklist passes.
