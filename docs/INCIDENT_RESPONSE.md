# Incident Response

## Severity levels

### SEV-1

Use for real or possible capital loss, unexpected orders, leaked keys, or exchange/DB disagreement while trading.

Immediate actions:

1. Stop new trade execution.
2. Preserve logs and dashboard screenshots.
3. Check open positions directly on the exchange.
4. Rotate exchange keys if leakage is suspected.
5. Record root cause before resuming.

### SEV-2

Use for failed notifications, API downtime, dashboard downtime, or repeated reconciliation warnings in paper mode.

Immediate actions:

1. Keep paper mode enabled.
2. Review service logs.
3. Check database connectivity.
4. Check webhook or Telegram credentials.
5. Create a follow-up issue before resuming normal operation.

### SEV-3

Use for UI bugs, cosmetic dashboard issues, or non-blocking warnings.

Immediate actions:

1. Track the issue.
2. Patch only after CI remains green.
3. Do not change live-safety defaults for cosmetic issues.

## Required incident notes

Every incident should record:

- Date and time.
- Environment: local, Railway, paper, testnet, or live.
- Triggering alert.
- Open positions at time of incident.
- Daily PnL at time of incident.
- Root cause.
- Fix commit or PR.
- Decision to resume or stay paused.

## Resume criteria

Resume only when:

- CI is green.
- Reconciliation is clean.
- Notifications work.
- No unexplained open positions exist.
- The root cause is understood.
