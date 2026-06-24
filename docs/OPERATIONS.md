# Operations and safety

## Railway

The default deployment uses one Railway service plus PostgreSQL. The production
launcher starts the API and trading engine together. Express serves the compiled
dashboard on the same public port.

Use `/railway.toml` as the Config-as-Code path, or leave the default root config
discovery enabled. The start command is `corepack pnpm start`.

Do not use the dashboard `dev` command in Railway. The API serves the built
dashboard from `packages/dashboard/dist`.

Share `DATABASE_URL` across engine and API. Put `VITE_API_URL` in the dashboard
build environment and `API_ORIGIN` in the API service.

## Live trading gate

Keep `PAPER_TRADING=true` and `BYBIT_TESTNET=true` while validating. The recommended
minimum before considering production is:

1. 30 consecutive days in paper mode.
2. At least 200 completed trades.
3. Profit factor at least 1.3 and Sharpe at least 0.8.
4. No unhandled crash for seven consecutive days.
5. Manual reconciliation of a restart while a paper position is open.
6. Independent review of API key permissions (trade only; withdrawals disabled).

Live mode requires `PAPER_TRADING=false`, non-empty Bybit credentials, and explicit
production environment configuration. Start with the smallest allowed position cap.

## Incident controls

- `PAUSED`: prevents new signals; existing positions remain managed.
- `STOPPED`: trips the circuit breaker and invokes exchange cancellation.
- Daily loss and max drawdown blocks are evaluated before every order.
- Every exchange action has a database intent / state transition before the API call.

## Known operational boundary

The repository provides the platform and conservative controls, but no strategy can
guarantee profit. Backtesting, slippage modelling, exchange-specific quantity rounding,
and external security review remain mandatory before real funds are used.
