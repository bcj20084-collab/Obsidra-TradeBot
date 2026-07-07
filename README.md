# Obsidra TradeBot

Obsidra TradeBot is a production-oriented crypto trading platform built with a TypeScript engine, Express/tRPC API, React dashboard, PostgreSQL persistence, Telegram notifications, strict risk controls, and Railway deployment support.

The project is designed to run safely in paper mode first. It can scan markets, generate signals, simulate execution with fees and slippage, monitor open positions, record every decision, and expose operational diagnostics through the dashboard and `/health/deep`.

> Safety first: `PAPER_TRADING=true` is the default. Do not enable live trading until the strategy has passed a long paper-validation period with enough trades, stable drawdown, and verified exchange configuration. No trading bot can guarantee profit.

## Current highlights

- Multi-exchange architecture for Bybit and Binance.
- Paper trading with realistic fees, spread crossing, and slippage.
- Trend and Pullback strategy envelopes enabled by default; Grid, DCA, Scalp, and Copy modules are scaffolded and disabled by default.
- Premium dark dashboard with live bot status, open trade monitoring, AI brain panels, operator report, risk diagnostics, and runtime debug findings.
- Telegram clean mode: startup notification, trade open/close alerts, manual `/status`, `/why`, `/report`, and `/risk`.
- `/health/deep` endpoint with:
  - active strategies;
  - open trades;
  - recent trades;
  - 24h closed trades;
  - no-trade diagnostics;
  - risk-gate diagnostics;
  - ready-signal watchdog;
  - operator report;
  - runtime debug findings.
- Binance paper mode uses live public market data while keeping execution simulated.
- Circuit breakers, loss cooldowns, portfolio exposure limits, and max-open-position controls.
- PostgreSQL audit trail for trades, journal entries, bot events, backtests, and strategy state.

## Monorepo layout

```text
packages/
  api/        Express 5 + tRPC API, auth, health endpoints, dashboard serving
  dashboard/  React + Vite dashboard
  engine/     market data, signals, risk, execution, Telegram, Discord, training
  shared/     Prisma client, env validation, contracts, logging
scripts/      production startup and Railway helpers
docs/         operational notes and architecture references
```

## Quick start

Requirements:

- Node.js 24.x
- pnpm 10.x
- PostgreSQL

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm dev
```

Run the full local validation suite:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Or run the full check:

```bash
pnpm check
```

## Production / Railway

Railway runs the API, dashboard assets, and engine in one service through:

```bash
pnpm start
```

Production build:

```bash
pnpm build
```

Database migration:

```bash
pnpm db:migrate
```

Health endpoints:

- `/health` — lightweight liveness check.
- `/ready` — verifies PostgreSQL connectivity.
- `/health/deep` — full operational snapshot for debugging.

## Important environment variables

Core:

```env
DATABASE_URL=
NODE_ENV=production
PORT=8080
PAPER_TRADING=true
MASTER_SECRET=
JWT_SECRET=
DASHBOARD_PASSWORD=
```

Exchange:

```env
BYBIT_TESTNET=true
BYBIT_DEMO=false
BYBIT_API_KEY=
BYBIT_API_SECRET=
BYBIT_API_KEY_NEW=
BYBIT_API_SECRET_NEW=

BINANCE_TESTNET=true
BINANCE_API_KEY=
BINANCE_API_SECRET=
```

Telegram:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_STATUS_INTERVAL_MINUTES=0
```

Strategy controls:

```env
STRATEGY_TREND_ENABLED=true
STRATEGY_PULLBACK_ENABLED=true
STRATEGY_GRID_ENABLED=false
STRATEGY_DCA_ENABLED=false
STRATEGY_SCALP_ENABLED=false
STRATEGY_COPY_ENABLED=false

TREND_SYMBOLS=BTCUSDT,ETHUSDT
TREND_EXCHANGE=binance
TREND_PAPER_TRADING=true

PULLBACK_SYMBOL=DOGEUSDT
PULLBACK_EXCHANGE=binance
PULLBACK_PAPER_TRADING=true
PULLBACK_TIMEFRAME=240
```

Risk controls:

```env
MAX_OPEN_POSITIONS=2
MAX_OPEN_POSITIONS_TOTAL=5
PORTFOLIO_MAX_USDT=800
PORTFOLIO_MAX_USDT_PER_SYMBOL=600
TOTAL_DAILY_LOSS_LIMIT_USDT=100
MAX_CONSECUTIVE_LOSSES=3
LOSS_COOLDOWN_MINUTES=240
MIN_SIGNAL_SCORE=65
```

## Telegram commands

The bot keeps Telegram clean and avoids spamming status messages. It sends:

- short `BOT ON` notification after restart;
- trade-open notifications;
- trade-close win/loss notifications;
- manual command responses.

Commands:

```text
/status  current bot status
/why     why the bot is not entering right now
/report  24h operator report
/risk    risk gate by symbol
/help    command list
```

## Debug workflow

The main debugging endpoint is:

```text
GET /health/deep
```

Key fields:

- `botStatus` — current bot state.
- `activeStrategies` — enabled strategies and symbols.
- `openTrades` — active paper/live positions.
- `recentTrades6h` — recent open/closed trade activity.
- `closedTrades24h` — closed trades used by the operator report.
- `noTradeDiagnostics` — why each strategy is waiting, protected, managing, or ready.
- `riskGateDiagnostics` — recent risk rejects and the reason.
- `readyWatchdog` — detects stale READY signals that did not execute.
- `operatorReport24h` — PnL, winrate, signals, risk rejects, blockers, recommendation.
- `debugFindings` — compact runtime findings such as stale market data or execution warnings.

Example check:

```bash
curl https://obsidra-tradebot-production.up.railway.app/health/deep
```

## Market data note

In paper mode, execution remains simulated, but market data should be realistic and liquid. Binance paper mode therefore uses Binance public mainnet market data while keeping orders simulated inside the bot. This avoids stale or incomplete demo/testnet candle feeds affecting strategy evaluation.

## Live trading gate

Live trading should remain disabled unless all of these are true:

- paper trading has enough sample size;
- PnL, winrate, drawdown, and profit factor are acceptable;
- `/health/deep.debugFindings.level` is not `BUG`;
- risk-gate diagnostics are understood;
- exchange keys have the correct permissions;
- IP restrictions are configured if required;
- `LIVE_TRADING_CONFIRMATION=I_ACCEPT_REAL_MONEY_RISK` is set intentionally.

## Common commands

```bash
pnpm dev          # run engine, API, and dashboard locally
pnpm typecheck    # TypeScript validation
pnpm test         # Vitest suite
pnpm build        # production build
pnpm db:generate  # generate Prisma client
pnpm db:push      # sync local/dev schema
pnpm db:migrate   # deploy migrations
pnpm audit:prod   # production dependency audit
```

## Operational philosophy

Obsidra should behave like an operator, not a gambler:

- protect capital first;
- explain why it does not trade;
- log every important decision;
- stay in paper mode while learning;
- surface bugs before changing strategy thresholds;
- improve strategies only after market data and execution are verified healthy.

