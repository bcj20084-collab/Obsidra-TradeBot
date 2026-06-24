# Live Trading Checklist

Do not switch to live money until all items are true.

## Paper performance gate

- [ ] Minimum 30 days of paper trading completed.
- [ ] Minimum 200 closed paper trades.
- [ ] Profit factor >= 1.3.
- [ ] Sharpe ratio >= 0.8.
- [ ] Max drawdown stayed below configured limit.
- [ ] Zero crashes for 7 consecutive days.

## Safety gate

- [ ] Reconciliation service tested after restart.
- [ ] Daily loss guard tested.
- [ ] Max drawdown guard tested.
- [ ] Exposure guard tested.
- [ ] Emergency stop tested from API and dashboard.
- [ ] Notifications tested on Telegram and Discord.
- [ ] Incident response drill completed.

## Deployment gate

- [ ] PostgreSQL migration applied cleanly.
- [ ] Railway services have correct env vars.
- [ ] No secrets committed to GitHub.
- [ ] Exchange keys have minimum permissions needed.
- [ ] CI is green on the exact commit being deployed.
- [ ] Operations runbook reviewed.

Default env values keep the system in paper/testnet mode.
