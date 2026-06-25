# Operations and safety

## Railway

The default deployment uses one Railway service plus PostgreSQL. The production
launcher starts the API and trading engine together. Express serves the compiled
dashboard on the same public port.

Use `/railway.toml` as the Config-as-Code path, or leave the default root config
discovery enabled. The start command is `corepack pnpm start`.

Nixpacks performs the frozen-lockfile install in its install phase. The build
command intentionally runs only `corepack pnpm build` to avoid installing the
workspace twice and slowing down Docker image export.

Railway runs `corepack pnpm db:migrate` as a pre-deploy command. This applies
committed Prisma migrations before the API and engine are started.

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

Live mode requires `NODE_ENV=production`, `PAPER_TRADING=false`, production exchange
endpoints, non-empty credentials, and
`LIVE_TRADING_CONFIRMATION=I_ACCEPT_REAL_MONEY_RISK`. Start with the smallest allowed
position cap. This acknowledgement is deliberately awkward so a copied `.env` cannot
silently begin trading real funds.

## Bybit Demo Trading

Bybit Demo Trading is different from Testnet. To send simulated orders against
mainnet market prices, use:

```dotenv
BYBIT_TESTNET=false
BYBIT_DEMO=true
PAPER_TRADING=false
TREND_PAPER_TRADING=false
```

Store the Demo Trading API key in `BYBIT_API_KEY_NEW` and its secret in
`BYBIT_API_SECRET_NEW`. The engine uses `https://api-demo.bybit.com` for private REST
requests and the mainnet public WebSocket for market data. Never commit either secret.

Every trade stores `executionMode` (`PAPER` or `LIVE`) so validation statistics cannot
accidentally mix simulations with real-money fills.

## Execution realism and risk budget

- Paper market orders cross the current bid/ask, apply `PAPER_SLIPPAGE_BPS`, and charge
  `PAPER_FEE_RATE`. Tune both values conservatively for the exchange and account tier.
- `MAX_RISK_PER_TRADE_PCT` caps the estimated loss at the stop, including leverage.
- After `MAX_CONSECUTIVE_LOSSES`, new entries pause for `LOSS_COOLDOWN_MINUTES`.
- Backtests make decisions only from completed candles and execute at the next candle
  open. This avoids same-candle look-ahead bias.

## Incident controls

- `PAUSED`: prevents new signals; existing positions remain managed.
- `STOPPED`: trips the circuit breaker and invokes exchange cancellation.
- Daily loss and max drawdown blocks are evaluated before every order.
- Every exchange action has a database intent / state transition before the API call.

## Known operational boundary

The repository provides the platform and conservative controls, but no strategy can
guarantee profit. Exchange-specific quantity/tick rounding, testnet smoke tests,
walk-forward validation, and external security review remain mandatory before real
funds are used.
# Copy trading data source

Set `COPY_POSITION_FEED_URL` only to an authorized HTTPS endpoint that returns an
array of `{ symbol, direction, size, entryPrice, leverage }` records for the
requested `traderId`. The copy strategy remains paused when this value is empty.
