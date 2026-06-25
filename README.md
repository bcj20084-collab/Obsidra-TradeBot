# Obsidra TradeBot 1.0

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

Version 1.0 modernizes the production stack to Node.js 24, TypeScript 6, Vite 8,
Tailwind CSS 4, React 19.2, Zod 4 and Vitest 4. Telegram commands and Discord
webhooks now use the native Node HTTP stack, removing vulnerable legacy dependency
trees. The API adds security headers, database readiness checks and resilient live
snapshots, while the dashboard reports stale/offline data explicitly.

> **Safety first:** `PAPER_TRADING` defaults to `true`. Do not enable live trading
> until the strategy has passed at least 30 days / 200 trades of paper validation.
> Paper fills include configurable spread crossing, slippage and fees; live mode also
> requires an explicit real-money acknowledgement.

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
pnpm check
pnpm audit:prod
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
The liveness endpoint is `/health`, and `/ready` verifies PostgreSQL connectivity.

Copy trading requires an authorized HTTPS position feed configured through
`COPY_POSITION_FEED_URL`. Bybit V5 does not provide a public API for reading an
arbitrary master trader's positions by UID, so the strategy pauses safely when no
feed is configured.
