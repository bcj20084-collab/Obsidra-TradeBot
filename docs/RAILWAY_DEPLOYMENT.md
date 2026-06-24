# Railway Deployment

Obsidra is designed as a safe-first monorepo with three deployable services: engine, API and dashboard.

## 1. Required Railway services

Create these Railway services from the same GitHub repo:

- `engine` — runs the trading engine worker
- `api` — exposes auth, dashboard API and health checks
- `dashboard` — serves the React dashboard
- `postgres` — Railway PostgreSQL plugin

## 2. Required environment variables

Set these variables for engine and API:

```bash
DATABASE_URL=postgresql://...
NODE_ENV=production
PAPER_TRADING=true
BYBIT_TESTNET=true
TRADING_SYMBOL=BTCUSDT
TRADING_LEVERAGE_MAX=5
TRADING_POSITION_MAX_USDT=500
DAILY_LOSS_LIMIT_USDT=50
MAX_DRAWDOWN_PCT=8
MIN_SIGNAL_SCORE=65
SPREAD_MAX_PCT=0.05
JWT_SECRET=replace-with-strong-random-secret
DASHBOARD_PASSWORD=replace-with-strong-password
```

Optional notification variables:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_TRADES=
DISCORD_WEBHOOK_ALERTS=
DISCORD_WEBHOOK_DAILY=
```

Live trading variables must stay empty until paper trading is complete:

```bash
BYBIT_API_KEY=
BYBIT_API_SECRET=
```

## 3. Deploy commands

Use these start commands:

```bash
engine: pnpm --filter @obsidra/engine build && pnpm --filter @obsidra/engine migrate && node packages/engine/dist/main.js
api: pnpm --filter @obsidra/api build && node packages/api/dist/index.js
dashboard: pnpm --filter @obsidra/dashboard build && npx serve packages/dashboard/dist -l 8080
```

## 4. Migration flow

Before engine starts in production, run:

```bash
pnpm --filter @obsidra/engine migrate
```

This applies the committed Prisma migration files to PostgreSQL.

## 5. Safety defaults

Keep these values until all checklist requirements pass:

```bash
PAPER_TRADING=true
BYBIT_TESTNET=true
```

Do not set real Bybit API keys until paper mode has run successfully and the live-trading checklist is complete.
