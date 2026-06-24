# Prompt Implementation Map

This repo implements the uploaded production prompt as a safe foundation.

Implemented now:

- pnpm TypeScript monorepo
- engine/api/dashboard packages
- Bybit V5 public WebSocket client
- Bybit REST client wrapper with signed requests
- MarketDataStore with candle buffers
- EMA, RSI, MACD, Bollinger Bands, ADX, ATR
- Signal pipeline with trend, entry, ML adjustment and final checks
- adaptive params and circuit breaker
- RiskEngine gatekeeper with daily loss, drawdown, sizing and pre-flight checks
- order state machine and execution journal interfaces
- paper-first OrderManager
- metrics collector
- Telegram/Discord notifier wrappers
- dashboard auth API pattern with httpOnly JWT cookie
- React dashboard pages
- Prisma schema
- Railway and GitHub Actions files

Still needs hardening before live:

- real DB repository implementation around Prisma client
- full private Bybit position/order reconciliation tests
- end-to-end tests against Bybit testnet
- Redis cache, if desired
- action SHA pinning in CI/deploy workflows
