# Obsidra TradeBot

Obsidra TradeBot is a TypeScript monorepo for a safety-first Bybit USDT-M futures bot.

Default mode is **paper trading**. Do not enable live trading until you have passed the checklist in `docs/LIVE_TRADING_CHECKLIST.md`.

## Apps

- `packages/engine` — market data, indicators, signals, risk gatekeeper, paper execution, journal and metrics
- `packages/api` — Express + tRPC API for dashboard control and metrics
- `packages/dashboard` — React/Vite dashboard with dark UI

## Start locally

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
pnpm dev
```

## Safety defaults

- `PAPER_TRADING=true`
- `BYBIT_TESTNET=true`
- every order must pass `RiskEngine.approve()`
- daily loss guard and drawdown guard enabled
- env variables validated on startup with Zod
- structured logs only
- no browser storage for dashboard auth

## Deployment

Railway config is included in `railway.toml`. Add PostgreSQL on Railway and set the env vars from `.env.example`.

## Important

This repository is not a promise of profit. Run paper trading first. Do not use live money until the safety checklist passes.
