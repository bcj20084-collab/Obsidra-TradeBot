# Obsidra TradeBot

Production-oriented Bybit and Binance USDT-M trading platform with a TypeScript engine, tRPC API,
React dashboard, PostgreSQL persistence, paper trading, strict risk controls, and
Railway deployment configuration.

Version 2 adds multiplexed multi-symbol market data, portfolio exposure limits,
historical candle storage, saved backtests, validated per-symbol ML training,
an immutable audit trail, IP allowlisting and hardened dashboard authentication.

Version 3 adds exchange adapters and deterministic routing, isolated Trend/Grid/DCA/
Scalp/Copy strategy envelopes, strategy conflict coordination, portfolio-wide risk
limits, per-strategy persistence and a Strategies dashboard. New strategies remain
disabled and in paper mode by default.

> **Safety first:** `PAPER_TRADING` defaults to `true`. Do not enable live trading
> until the strategy has passed at least 30 days / 200 trades of paper validation.

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
pnpm dev
```

Run PostgreSQL locally, set `DATABASE_URL`, then:

```bash
pnpm db:push
pnpm test
pnpm typecheck
pnpm build
```

## Services

- `packages/engine` – market data, signals, risk, execution, reconciliation, metrics.
- `packages/api` – Express 5 + tRPC, JWT httpOnly-cookie auth and bot controls.
- `packages/dashboard` – React/Vite dashboard.
- `packages/shared` – environment validation, Prisma client, contracts and logging.

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for deployment and live-trading gates.

Configure up to five symbols with `TRADING_SYMBOLS=BTCUSDT,ETHUSDT`. The engine
warms its indicator buffers through Bybit REST before opening the WebSocket, so
Railway restarts do not require days of candle accumulation.

Railway runs API, dashboard assets and engine in one service through
`scripts/start-production.mjs`; the database migration runs before every deployment.

Copy trading requires an authorized HTTPS position feed configured through
`COPY_POSITION_FEED_URL`. Bybit V5 does not provide a public API for reading an
arbitrary master trader's positions by UID, so the strategy pauses safely when no
feed is configured.
