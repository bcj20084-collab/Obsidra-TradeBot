# Obsidra TradeBot

Production-oriented Bybit USDT-M trading platform with a TypeScript engine, tRPC API,
React dashboard, PostgreSQL persistence, paper trading, strict risk controls, and
Railway deployment configuration.

Version 2 adds multiplexed multi-symbol market data, portfolio exposure limits,
historical candle storage, saved backtests, validated per-symbol ML training,
an immutable audit trail, IP allowlisting and hardened dashboard authentication.

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
