# Obsidra TradeBot

Obsidra TradeBot is a TypeScript monorepo for a safety-first Bybit USDT-M futures bot.

Default mode is **paper trading**. Do not enable live trading until you have passed the paper-trading checklist in `docs/LIVE_TRADING_CHECKLIST.md`.

## Apps

- `packages/engine` — market data, signals, risk gatekeeper, paper execution, journals, metrics
- `packages/api` — Express API for dashboard control and metrics
- `packages/dashboard` — React/Vite dashboard

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
- every order must pass `RiskEngine.approve()`
- daily loss guard and drawdown guard enabled
- env variables validated on startup with Zod
- structured logs only
- no browser storage for dashboard auth

## Deployment

Railway config is included in `railway.toml`. Add PostgreSQL on Railway and set the env vars from `.env.example`.
