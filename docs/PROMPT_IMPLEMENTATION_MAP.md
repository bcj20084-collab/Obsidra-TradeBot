# Prompt Implementation Map

This repo implements the uploaded production prompt as a safe foundation.

Implemented now:

- pnpm TypeScript monorepo
- engine/api/dashboard packages
- Bybit V5 public WebSocket client
- Bybit REST client wrapper with signed requests and rate limiting
- MarketDataStore with candle buffers
- EMA, RSI, MACD, Bollinger Bands, ADX, ATR
- Signal pipeline with trend, entry, ML adjustment and final checks
- AdaptiveParams and CircuitBreaker
- RiskEngine gatekeeper with daily loss, drawdown, sizing and pre-flight checks
- ExposureGuard module with tests
- OrderStateMachine and ExecutionJournal interfaces
- PaperSimulator and TradeLifecycleService foundation
- TradeRepository and LogRepository around Prisma
- Initial PostgreSQL migration and Prisma indexes
- MLTrainer with persistent weights in PostgreSQL
- MetricsCollector
- Telegram commands and Discord embed notifiers
- NotifierHub for parallel Telegram and Discord sends
- Dashboard auth API pattern with httpOnly JWT cookie
- API control router for pause, resume, idle mode and config
- React dashboard pages with metrics cards, equity curve, live ticker, CSV preview and adaptive params panel
- Prisma schema
- Railway deployment guide and GitHub Actions CI
- Operations runbook and incident response guide
- Live-trading checklist

Still needs hardening before live:

- full OrderManager DB lifecycle wiring when the patch can be applied safely
- full private Bybit position and order reconciliation tests
- end-to-end tests against Bybit testnet
- real closed-trade PnL reconciliation from exchange fills
- Redis cache, if desired
- action SHA pinning in CI and deploy workflows
- at least 30 days paper trading and checklist pass before live mode
