import { AppError, ErrorCode, getEnv, moduleLogger, operatorBlock, operatorLog, premiumLog, prisma, strategyCatalog, tradingSymbols, type BotStatus, type Direction } from "@obsidra/shared";
import { BybitRestClient } from "./data/BybitRestClient.js";
import { BybitWebSocket } from "./data/BybitWebSocket.js";
import { MarketDataStore } from "./data/MarketDataStore.js";
import { BinanceAdapter } from "./exchanges/binance/BinanceAdapter.js";
import { BinanceRestClient } from "./exchanges/binance/BinanceRestClient.js";
import { BinanceWebSocket } from "./exchanges/binance/BinanceWebSocket.js";
import { BybitAdapter } from "./exchanges/bybit/BybitAdapter.js";
import { ExchangeRouter } from "./exchanges/ExchangeRouter.js";
import { ExecutionJournal } from "./execution/ExecutionJournal.js";
import { OrderManager } from "./execution/OrderManager.js";
import { OrderStateMachine } from "./execution/OrderStateMachine.js";
import { ReconciliationService } from "./execution/ReconciliationService.js";
import { DiscordNotifier } from "./monitoring/DiscordNotifier.js";
import { startHealthServer } from "./monitoring/HealthCheck.js";
import { MetricsCollector } from "./monitoring/MetricsCollector.js";
import { TelegramNotifier } from "./monitoring/TelegramNotifier.js";
import { adx, atr } from "./indicators/index.js";
import { PreFlightCheck } from "./risk/PreFlightCheck.js";
import { PortfolioRiskEngine } from "./risk/PortfolioRiskEngine.js";
import { RiskEngine } from "./risk/RiskEngine.js";
import { AdaptiveParams } from "./signals/AdaptiveParams.js";
import { CircuitBreaker } from "./signals/CircuitBreaker.js";
import { MLScorer } from "./signals/MLScorer.js";
import { SignalEngine } from "./signals/SignalEngine.js";
import { MLTrainer } from "./signals/MLTrainer.js";
import { createStrategy } from "./strategies/StrategyFactory.js";
import { StrategyCoordinator } from "./strategies/StrategyCoordinator.js";
import type { ExchangeId, IExchangeAdapter } from "./exchanges/IExchangeAdapter.js";
import type { ApiCredential } from "./security/ApiKeyManager.js";

const env = getEnv();
const log = moduleLogger("engine");
const symbols = tradingSymbols(env);
const descriptors = strategyCatalog(env);
const activeDescriptors = descriptors.filter((item) => item.enabled);
const bybitSymbols = activeDescriptors.filter((item) => item.exchange === "bybit" && item.symbol !== "MULTI").map((item) => item.symbol);
const marketSymbols = [...new Set([...symbols, ...bybitSymbols])];
const bybitStore = new MarketDataStore();
const binanceStore = new MarketDataStore();
const marketStores = new Map<ExchangeId, MarketDataStore>([["bybit", bybitStore], ["binance", binanceStore]]);
const bybitPaper = activeDescriptors.filter((item) => item.exchange === "bybit").every((item) => item.isPaperTrading);
const binancePaper = activeDescriptors.filter((item) => item.exchange === "binance").every((item) => item.isPaperTrading);
const bybitCredentialCandidates = buildBybitCredentialCandidates();
const client = new BybitRestClient(
  bybitCredentialCandidates[0]?.apiKey ?? "",
  bybitCredentialCandidates[0]?.apiSecret ?? "",
  env.BYBIT_TESTNET,
  bybitPaper,
  env.MASTER_SECRET,
  env.BYBIT_DEMO,
  bybitCredentialCandidates.slice(1),
);
// Demo Trading consumes mainnet public market data; only its private REST domain differs.
const websocket = new BybitWebSocket(bybitStore, marketSymbols, env.BYBIT_TESTNET && !env.BYBIT_DEMO);
const bybitAdapter = new BybitAdapter(client, websocket, bybitStore, env.PAPER_FEE_RATE, env.PAPER_SLIPPAGE_BPS);
const binanceRest = new BinanceRestClient(
  env.BINANCE_API_KEY,
  env.BINANCE_API_SECRET,
  env.BINANCE_TESTNET,
  binancePaper,
  env.PAPER_FEE_RATE,
  env.PAPER_SLIPPAGE_BPS,
);
const binanceWebsocket = new BinanceWebSocket(env.BINANCE_TESTNET);
const binanceAdapter = new BinanceAdapter(binanceRest, binanceWebsocket);
const exchanges = new ExchangeRouter([bybitAdapter, binanceAdapter]);
const telegram = new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
const discord = new DiscordNotifier(env.DISCORD_WEBHOOK_TRADES, env.DISCORD_WEBHOOK_ALERTS, env.DISCORD_WEBHOOK_DAILY);
const journal = new ExecutionJournal();
const stateMachine = new OrderStateMachine(journal);
const orderManager = new OrderManager(exchanges, stateMachine, journal, (trade) => telegram.tradeClosed(trade));
const reconciliation = new ReconciliationService(
  [bybitAdapter, binanceAdapter],
  journal,
  (trade) => telegram.tradeClosed(trade),
);
const metrics = new MetricsCollector();
const trainer = new MLTrainer();
const portfolio = new PortfolioRiskEngine({
  totalMax: env.PORTFOLIO_MAX_USDT,
  perSymbolMax: env.PORTFOLIO_MAX_USDT_PER_SYMBOL,
  bybitMax: env.BYBIT_MAX_EXPOSURE_USDT,
  binanceMax: env.BINANCE_MAX_EXPOSURE_USDT,
  dailyLossLimit: env.TOTAL_DAILY_LOSS_LIMIT_USDT,
  maxPositions: env.MAX_OPEN_POSITIONS_TOTAL,
});
const coordinator = new StrategyCoordinator(env.ALLOW_SAME_SYMBOL_HEDGE, env.PORTFOLIO_MAX_USDT_PER_SYMBOL);
let status: BotStatus = "RUNNING";
const processing = new Set<string>();
const closeWatchers = new Set<string>();

interface TradingContext {
  exchange: ExchangeId;
  symbol: string;
  adapter: IExchangeAdapter;
  store: MarketDataStore;
  adaptive: AdaptiveParams;
  circuitBreaker: CircuitBreaker;
  ml: MLScorer;
  signals: SignalEngine;
  risk: RiskEngine;
}

function contextKey(exchange: ExchangeId, symbol: string): string {
  return `${exchange}:${symbol}`;
}

function buildBybitCredentialCandidates(): ApiCredential[] {
  const candidates: ApiCredential[] = [];
  if (env.BYBIT_API_KEY_NEW.trim() && env.BYBIT_API_SECRET_NEW.trim()) {
    candidates.push({ source: "BYBIT_API_KEY_NEW", apiKey: env.BYBIT_API_KEY_NEW, apiSecret: env.BYBIT_API_SECRET_NEW });
  }
  if (env.BYBIT_API_KEY.trim() && env.BYBIT_API_SECRET.trim()) {
    candidates.push({ source: "BYBIT_API_KEY", apiKey: env.BYBIT_API_KEY, apiSecret: env.BYBIT_API_SECRET });
  }
  return candidates;
}

function formatMaybeNumber(value: unknown, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function describeSkippedSignal(reason: string, details: Record<string, unknown>): string {
  const parts = [
    reason,
    `Price: ${formatMaybeNumber(details.price, 4)}${details.priceSource ? ` (${String(details.priceSource)})` : ""}`,
  ];
  if (typeof details.score === "number") parts.push(`Score: ${formatMaybeNumber(details.score, 0)}/${formatMaybeNumber(details.minimumScore, 0)}`);
  if (typeof details.adx === "number") parts.push(`ADX: ${formatMaybeNumber(details.adx, 1)}`);
  if (typeof details.rsi === "number") parts.push(`RSI: ${formatMaybeNumber(details.rsi, 1)}`);
  if (typeof details.baseScore === "number") parts.push(`Base: ${formatMaybeNumber(details.baseScore, 0)}`);
  return parts.join(" | ");
}

function createContext(exchange: ExchangeId, symbol: string): TradingContext {
  const adapter = exchanges.get(exchange);
  const store = marketStores.get(exchange)!;
  const adaptive = new AdaptiveParams(symbol, env.MIN_SIGNAL_SCORE);
  const circuitBreaker = new CircuitBreaker();
  const ml = new MLScorer(symbol);
  const preflight = new PreFlightCheck(adapter, env.SPREAD_MAX_PCT);
  return {
    exchange,
    symbol,
    adapter,
    store,
    adaptive,
    circuitBreaker,
    ml,
    signals: new SignalEngine(store, ml, adaptive, circuitBreaker),
    risk: new RiskEngine(
      env.DAILY_LOSS_LIMIT_USDT,
      env.WEEKLY_LOSS_LIMIT_USDT,
      env.MAX_DRAWDOWN_PCT,
      env.TRADING_POSITION_MAX_USDT,
      preflight,
      adapter,
      adaptive,
      env.MAX_RISK_PER_TRADE_PCT,
      env.MAX_CONSECUTIVE_LOSSES,
      env.LOSS_COOLDOWN_MINUTES,
    ),
  };
}

const initialPairs = new Map<string, { exchange: ExchangeId; symbol: string }>();
for (const descriptor of activeDescriptors) {
  if (descriptor.symbol !== "MULTI") initialPairs.set(contextKey(descriptor.exchange, descriptor.symbol), { exchange: descriptor.exchange, symbol: descriptor.symbol });
}
if (initialPairs.size === 0) {
  for (const symbol of symbols) initialPairs.set(contextKey("bybit", symbol), { exchange: "bybit", symbol });
}
const contexts = new Map([...initialPairs].map(([key, pair]) => [key, createContext(pair.exchange, pair.symbol)]));

function executionEnvironmentLabel(): string {
  const activeRemoteBinance = activeDescriptors.some((item) => item.exchange === "binance" && !item.isPaperTrading);
  const activeRemoteBybit = activeDescriptors.some((item) => item.exchange === "bybit" && !item.isPaperTrading);
  if (activeRemoteBinance) return env.BINANCE_TESTNET ? "BINANCE TESTNET" : "BINANCE LIVE";
  if (activeRemoteBybit) return env.BYBIT_DEMO ? "BYBIT DEMO" : env.BYBIT_TESTNET ? "BYBIT TESTNET" : "BYBIT LIVE";
  return "PAPER";
}

function getOrCreateContext(exchange: ExchangeId, symbol: string): TradingContext {
  const key = contextKey(exchange, symbol);
  const existing = contexts.get(key);
  if (existing) return existing;
  const created = createContext(exchange, symbol);
  contexts.set(key, created);
  void created.ml.initialize();
  return created;
}

const strategies = activeDescriptors.map((descriptor) => createStrategy({
  ...descriptor,
  status: descriptor.isPaperTrading ? "PAPER" : "RUNNING",
}, {
  exchanges,
  storeFor: (exchange) => marketStores.get(exchange)!,
  orderManager,
  journal,
  riskForSymbol: (symbol, exchange) => getOrCreateContext(exchange, symbol).risk,
  approveOrder: async (config, direction, sizeUsdt, symbol = config.symbol) => {
    const conflict = coordinator.check(config.exchange, symbol, config.type, direction, sizeUsdt, config.id);
    if (!conflict.approved) return conflict;
    return portfolio.approve(config.exchange, symbol, sizeUsdt, ["DCA", "GRID"].includes(config.type) ? config.id : undefined);
  },
  registerOpen: (config, direction, sizeUsdt, symbol = config.symbol) => {
    coordinator.open(config.exchange, symbol, { strategyId: config.id, type: config.type, direction, sizeUsdt });
  },
  unregisterOpen: (config, symbol = config.symbol) => {
    coordinator.close(config.exchange, symbol, config.id);
  },
  onTrendCandle: (symbol, exchange) => evaluate(exchange, symbol),
}));

async function bootstrap(): Promise<void> {
  let startupStage = "database_connect";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await prisma.$connect();
  startupStage = "database_state";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await prisma.botState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", status },
    update: { status, reason: env.PAPER_TRADING ? "Paper trading startup" : "Live startup" },
  });
  await prisma.botEvent.create({ data: { type: "STARTED", message: `Engine started (${env.PAPER_TRADING ? "paper" : "live"})` } });
  startupStage = "telegram_initialize";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await telegram.initialize().catch((error) => {
    log.warn({ error }, "Telegram initialization failed; engine will continue");
  });
  startupStage = "ml_initialize";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await Promise.all([...contexts.values()].map((context) => context.ml.initialize()));
  const reconciliationSymbols = [...new Set([
    ...symbols,
    ...activeDescriptors.filter((descriptor) => descriptor.symbol !== "MULTI").map((descriptor) => descriptor.symbol),
  ])];
  startupStage = "exchange_reconciliation";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await Promise.allSettled(reconciliationSymbols.map((symbol) => reconciliation.reconcile(symbol)));
  startupStage = "restore_state";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await restoreCoordinator();
  startupStage = "start_strategies";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await Promise.all(strategies.map((strategy) => strategy.start()));
  subscribeStrategies();
  startupStage = "market_data_warmup";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  await warmMarketData();
  startupStage = "websocket_connect";
  premiumLog("engine", "startup_stage", { stage: startupStage }, "info", `Engine startup: ${startupStage}`);
  websocket.connect();
  startHealthServer(env.PORT + 1, () => metrics.latest);
  setInterval(refreshControl, 2_000).unref();
  setInterval(refreshMetrics, 300_000).unref();
  if (env.ENGINE_LOG_HEARTBEAT_SECONDS > 0) {
    setInterval(() => void logEngineHeartbeat(), env.ENGINE_LOG_HEARTBEAT_SECONDS * 1_000).unref();
    void logEngineHeartbeat();
  }
  if (telegram.configured && env.TELEGRAM_STATUS_INTERVAL_MINUTES > 0) {
    setInterval(() => void sendTelegramStatus(), env.TELEGRAM_STATUS_INTERVAL_MINUTES * 60_000).unref();
  }
  setInterval(() => void Promise.all([...new Set([...contexts.values()].map((context) => context.symbol))].map(async (symbol) => {
    await trainer.train(symbol);
    await Promise.all([...contexts.values()].filter((context) => context.symbol === symbol).map((context) => context.ml.initialize()));
  })), 3_600_000).unref();
  setInterval(() => void Promise.all(reconciliationSymbols.map((symbol) => reconciliation.reconcile(symbol))), 60_000).unref();
  websocket.on("fatal_disconnect", () => {
    status = "ERROR";
    for (const context of contexts.values()) {
      if (context.exchange === "bybit") context.circuitBreaker.trip("Bybit WebSocket disconnected");
    }
    void discord.alert("Bybit WebSocket disconnected after five retries. Engine halted.");
  });
  log.info({
    paperTrading: bybitPaper,
    bybitEnvironment: env.BYBIT_DEMO ? "demo" : env.BYBIT_TESTNET ? "testnet" : "mainnet",
    symbols,
    strategies: activeDescriptors.map((item) => item.id),
  }, "engine started");
  premiumLog("engine", "engine_started", {
    status,
    bybitEnvironment: env.BYBIT_DEMO ? "demo" : env.BYBIT_TESTNET ? "testnet" : "mainnet",
    executionMode: bybitPaper ? "PAPER" : env.BYBIT_DEMO ? "DEMO" : "LIVE",
    symbols,
    strategies: activeDescriptors.map((item) => ({
      id: item.id,
      type: item.type,
      exchange: item.exchange,
      symbol: item.symbol,
      mode: item.isPaperTrading ? "PAPER" : item.exchange === "bybit" && env.BYBIT_DEMO ? "DEMO" : "LIVE",
    })),
  }, "info", "Obsidra engine started");
  operatorBlock("OBSIDRA STARTED", [
    ["Status", status],
    ["Environment", executionEnvironmentLabel()],
    ["Symbols", symbols.join(", ")],
    ["Strategies", activeDescriptors.map((item) => `${item.type}:${item.symbol}`).join(", ") || "none"],
    ["Bybit credentials", bybitPaper ? "not required in PAPER" : bybitCredentialCandidates.map((item) => item.source).join(" -> ") || "missing"],
    ["Binance credentials", binancePaper ? "not required in PAPER" : env.BINANCE_API_KEY ? "BINANCE_API_KEY" : "missing"],
    ["Telegram", telegram.configured ? "connected" : "disabled"],
  ]);
  if (telegram.configured) {
    await telegram.send([
      "\u{1F916} <b>OBSIDRA STARTED</b>",
      `Environment: <b>${executionEnvironmentLabel()}</b>`,
      `Symbols: <b>${symbols.join(", ")}</b>`,
      `Strategies: <b>${activeDescriptors.map((item) => `${item.type}:${item.symbol}`).join(", ") || "none"}</b>`,
      "Status: <b>RUNNING \u{2705}</b>",
    ].join("\n")).catch((error) => log.warn({ error }, "startup Telegram notification failed"));
  }
}

function subscribeStrategies(): void {
  for (const symbol of new Set(activeDescriptors.filter((item) => item.exchange === "bybit" && item.symbol !== "MULTI").map((item) => item.symbol))) {
    bybitAdapter.subscribeCandles(symbol, ["1", "3", "15", "60", "240"], (candle) => void dispatchStrategyCandle("bybit", candle));
  }
  for (const symbol of new Set(activeDescriptors.filter((item) => item.exchange === "binance" && item.symbol !== "MULTI").map((item) => item.symbol))) {
    binanceAdapter.subscribeCandles(symbol, ["1", "3", "15", "60", "240"], (candle) => void dispatchStrategyCandle("binance", candle));
    binanceAdapter.subscribeTicker(symbol, (price, fundingRate) => {
      binanceStore.setTicker({ symbol, price, fundingRate, openInterest: 0, timestamp: Date.now() });
    });
  }
  binanceWebsocket.on("fatal", () => {
    log.error("Binance WebSocket reconnect exhausted");
    for (const strategy of strategies.filter((item) => item.config.exchange === "binance")) strategy.pause();
  });
}

async function dispatchStrategyCandle(exchange: "bybit" | "binance", candle: Parameters<typeof bybitAdapter.subscribeCandles>[2] extends (value: infer T) => void ? T : never): Promise<void> {
  if (!candle.confirmed) return;
  if (exchange === "binance") {
    binanceStore.addCandle({
      symbol: candle.symbol,
      timeframe: candle.interval,
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      confirmed: candle.confirmed,
    });
  }
  const matching = strategies.filter((strategy) => strategy.config.exchange === exchange && strategy.config.symbol === candle.symbol);
  await Promise.all(matching.map(async (strategy) => {
    try {
      await strategy.onCandle(candle);
    } catch (error) {
      strategy.pause();
      log.error({ error, strategyId: strategy.config.id }, "strategy isolated after candle failure");
    }
  }));
}

async function restoreCoordinator(): Promise<void> {
  const [open, gridLevels, dcaPositions] = await Promise.all([
    prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } }),
    prisma.gridLevel.findMany({ where: { status: "ACTIVE" } }),
    prisma.dCAPosition.findMany({ where: { status: { in: ["ACTIVE", "WAITING"] }, totalInvestedUsdt: { gt: 0 } } }),
  ]);
  for (const trade of open) {
    const descriptor = descriptors.find((item) => item.id === trade.strategyId);
    coordinator.open(trade.exchange as "bybit" | "binance", trade.symbol, {
      strategyId: trade.strategyId,
      type: descriptor?.type ?? "TREND",
      direction: trade.direction as Direction,
      sizeUsdt: trade.positionSizeUsdt,
    });
    if ((descriptor?.type ?? "TREND") === "TREND") void watchTradeClose(trade.id, trade.exchange as ExchangeId, trade.symbol, trade.strategyId);
  }
  for (const descriptor of descriptors.filter((item) => item.type === "GRID")) {
    const exposure = gridLevels.filter((level) => level.strategyId === descriptor.id).reduce((sum, level) => sum + level.orderSizeUsdt, 0);
    if (exposure > 0) coordinator.open(descriptor.exchange, descriptor.symbol, { strategyId: descriptor.id, type: "GRID", direction: "LONG", sizeUsdt: exposure });
  }
  for (const position of dcaPositions) {
    coordinator.open(position.exchange as "bybit" | "binance", position.symbol, {
      strategyId: position.strategyId,
      type: "DCA",
      direction: position.direction as Direction,
      sizeUsdt: position.totalInvestedUsdt,
    });
  }
}

async function warmMarketData(): Promise<void> {
  for (const context of contexts.values()) {
    try {
      for (const timeframe of ["1", "3", "15", "60", "240"]) {
        const candles = await context.adapter.getHistoricalCandles(context.symbol, timeframe, 200);
        for (const candle of candles) {
          context.store.addCandle({
            symbol: candle.symbol,
            timeframe: candle.interval,
            openTime: candle.openTime,
            closeTime: candle.closeTime,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            confirmed: candle.confirmed,
          });
        }
      }
      const [book, fundingRate] = await Promise.all([
        context.adapter.getBestBidAsk(context.symbol),
        context.adapter.getFundingRate(context.symbol),
      ]);
      context.store.setTicker({
        symbol: context.symbol,
        price: (book.bid + book.ask) / 2,
        fundingRate,
        openInterest: 0,
        timestamp: Date.now(),
      });
      log.info({ exchange: context.exchange, symbol: context.symbol }, "historical market data warmed");
      premiumLog("market-data", "market_data_warmed", {
        exchange: context.exchange,
        symbol: context.symbol,
        timeframes: ["1", "3", "15", "60", "240"],
        tickerPrice: context.store.getTicker(context.symbol)?.price ?? null,
      }, "info", `Market data ready for ${context.exchange}:${context.symbol}`);
    } catch (error) {
      log.warn({ exchange: context.exchange, symbol: context.symbol, error }, "market-data warmup failed; WebSocket accumulation will continue");
    }
  }
}

async function evaluate(exchange: ExchangeId, symbol: string): Promise<void> {
  const trendDescriptor = activeDescriptors.find((item) => item.type === "TREND" && item.exchange === exchange && item.symbol === symbol);
  const key = contextKey(exchange, symbol);
  if (!trendDescriptor || processing.has(key) || status !== "RUNNING") return;
  const context = getOrCreateContext(exchange, symbol);
  processing.add(key);
  try {
    const h4 = context.store.getCandles(symbol, "240");
    if (h4.length >= 80) {
      const atrSeries = atr(h4);
      const atrValue = atrSeries.at(-1) ?? 0;
      const recentAtr = atrSeries.slice(-20);
      const averageAtr = recentAtr.length ? recentAtr.reduce((sum, value) => sum + value, 0) / recentAtr.length : atrValue;
      const adxValue = adx(h4).at(-1) ?? 0;
      let equity = 10_000;
      if (!context.adapter.paperTrading) {
        try { equity = await context.adapter.getWalletBalance(); } catch (error) { log.warn({ exchange, symbol, error }, "wallet equity unavailable for adaptive update"); }
      }
      const history = await prisma.dailyMetrics.findMany({ orderBy: { date: "desc" }, take: 30, select: { equityEnd: true } });
      const peak = Math.max(equity, ...history.map((item) => item.equityEnd));
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      await context.adaptive.update(atrValue, averageAtr, adxValue, drawdown);
    }
    const evaluation = await context.signals.evaluateDetailed(symbol);
    premiumLog("signals", "signal_evaluated", {
      exchange,
      symbol,
      outcome: evaluation.signal ? "READY" : "SKIPPED",
      reason: evaluation.reason,
      ...evaluation.details,
    }, evaluation.signal ? "info" : "info", evaluation.signal
      ? `Trade signal ready: ${symbol} ${evaluation.signal.direction} score ${evaluation.signal.score}`
      : `No trade for ${symbol}: ${evaluation.reason}`);
    operatorLog(
      "INFO",
      evaluation.signal
        ? `SIGNAL | ${symbol} | ${evaluation.signal.direction}`
        : `SCAN | ${symbol}`,
      evaluation.signal
        ? `Confidence: ${(evaluation.signal.confidence * 100).toFixed(1)}% | Entry: $${evaluation.signal.entryPrice.toFixed(4)} | Score: ${evaluation.signal.score}/100`
        : describeSkippedSignal(evaluation.reason, evaluation.details),
    );
    const signal = evaluation.signal;
    if (!signal) return;
    await journal.record("SIGNAL_GENERATED", { signal });
    premiumLog("signals", "signal_generated", {
      exchange,
      symbol,
      direction: signal.direction,
      score: signal.score,
      confidence: signal.confidence,
      regime: signal.regime,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      indicators: signal.indicators,
      mlAdjustment: signal.mlAdjustment,
    }, "info", `Signal generated: ${symbol} ${signal.direction}`);
    const decision = await context.risk.approve(symbol, signal);
    await journal.record(decision.approved ? "RISK_APPROVED" : "RISK_REJECTED", { signal, decision });
    if (!decision.approved) {
      log.info({ exchange, symbol, reason: decision.reason }, "signal rejected");
      return;
    }
    const strategyId = trendDescriptor.id;
    const conflictDecision = coordinator.check(exchange, symbol, "TREND", signal.direction, decision.positionSizeUsdt, strategyId);
    if (!conflictDecision.approved) {
      await journal.record("RISK_REJECTED", { signal, decision: conflictDecision });
      return;
    }
    const portfolioDecision = await portfolio.approve(exchange, symbol, decision.positionSizeUsdt);
    if (!portfolioDecision.approved) {
      await journal.record("RISK_REJECTED", { signal, decision: portfolioDecision });
      return;
    }
    const tradeId = await orderManager.execute(symbol, signal, decision, exchange, strategyId);
    coordinator.open(exchange, symbol, { strategyId, type: "TREND", direction: signal.direction, sizeUsdt: decision.positionSizeUsdt });
    void watchTradeClose(tradeId, exchange, symbol, strategyId);
    await Promise.all([
      telegram.tradeOpened(symbol, signal, decision.positionSizeUsdt, decision.leverage),
      discord.tradeOpened(symbol, signal, decision.positionSizeUsdt, decision.leverage),
    ]);
    log.info({ tradeId }, "trade opened");
  } catch (error) {
    const exchangeError = error instanceof AppError
      && [ErrorCode.EXCHANGE_TEMPORARY, ErrorCode.EXCHANGE_PERMANENT, ErrorCode.RATE_LIMITED].includes(error.code);
    if (exchangeError) {
      operatorLog("WARNING", `EXCHANGE ERROR | ${exchange.toUpperCase()}:${symbol}`, `${error.code}: ${error.message} | next candle will retry`);
      log.warn({ error, exchange, symbol }, "evaluation skipped because exchange is unavailable");
      await telegram.alert(
        `Exchange error: ${exchange.toUpperCase()}`,
        `${symbol}: ${error.message}. Botul rămâne online și va reîncerca.`,
        `${exchange}:${error.code}`,
      ).catch((telegramError) => log.warn({ error: telegramError }, "Telegram exchange alert failed"));
    } else {
      status = "ERROR";
      context.circuitBreaker.trip(String(error));
      await discord.alert(`Critical engine error: ${String(error).slice(0, 500)}`);
      log.error({ error }, "evaluation failed");
    }
  } finally {
    processing.delete(key);
  }
}

async function logEngineHeartbeat(): Promise<void> {
  try {
    const openTrades = await prisma.trade.findMany({
      where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } },
    });
    const marketData = [...contexts.values()].map((context) => {
      const ticker = context.store.getTicker(context.symbol);
      const latestCandle = context.store.getCandles(context.symbol, "15", 1)[0];
      return {
        exchange: context.exchange,
        symbol: context.symbol,
        price: ticker?.price ?? null,
        fundingRate: ticker?.fundingRate ?? null,
        tickerAgeSeconds: ticker ? Math.round((Date.now() - ticker.timestamp) / 1_000) : null,
        last15mCandleAt: latestCandle ? new Date(latestCandle.closeTime).toISOString() : null,
        h4Candles: context.store.getCandles(context.symbol, "240").length,
        m15Candles: context.store.getCandles(context.symbol, "15").length,
        regime: context.adaptive.snapshot.regime,
        circuitBreaker: context.circuitBreaker.state.active,
      };
    });
    premiumLog("engine", "engine_heartbeat", {
      status,
      processingSymbols: [...processing],
      openPositionsCount: openTrades.length,
      activeStrategyCount: strategies.length,
      marketData,
    }, "info", `Bot heartbeat: ${status}, ${openTrades.length} open position(s)`);
    const currentMetrics = metrics.latest;
    const tradeRows: Array<[string, unknown]> = openTrades.map((trade) => {
      const ticker = contexts.get(contextKey(trade.exchange as ExchangeId, trade.symbol))?.store.getTicker(trade.symbol);
      const currentPrice = ticker?.price ?? trade.entryPrice ?? 0;
      const quantity = trade.entryPrice
        ? (trade.positionSizeUsdt * trade.leverage) / trade.entryPrice
        : 0;
      const unrealized = trade.entryPrice
        ? (trade.direction === "LONG" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) * quantity
        : 0;
      return [
        `POSITION ${trade.symbol}`,
        `Entry: $${(trade.entryPrice ?? 0).toFixed(4)} | Now: $${currentPrice.toFixed(4)} | PnL: ${unrealized >= 0 ? "+" : ""}${unrealized.toFixed(2)} USDT`,
      ];
    });
    operatorBlock(`STATUS | ${new Date().toISOString()}`, [
      ["Bot", status],
      ["Realized PnL", `${(currentMetrics?.totalPnlUsdt ?? 0).toFixed(2)} USDT`],
      ["Win Rate", `${(currentMetrics?.winRate ?? 0).toFixed(1)}%`],
      ["Drawdown", `${(currentMetrics?.currentDrawdown ?? 0).toFixed(2)}%`],
      ["Signals 24h", currentMetrics?.signalsGenerated24h ?? 0],
      ["Active Trades", openTrades.length],
      ...tradeRows,
      ["Next scan", "waiting for confirmed 15m candle"],
    ]);
  } catch (error) {
    premiumLog("engine", "engine_heartbeat_failed", { error }, "warn", "Bot heartbeat collection failed");
  }
}

async function sendTelegramStatus(): Promise<void> {
  try {
    const snapshots = [...contexts.values()].map((context) => ({ symbol: `${context.exchange}:${context.symbol}`, ...context.adaptive.snapshot }));
    const primary = snapshots[0];
    if (!primary) return;
    const snapshot = await metrics.collect(status, primary.regime, primary.config, snapshots);
    await telegram.status(snapshot);
  } catch (error) {
    log.warn({ error }, "Telegram status notification failed");
  }
}

async function watchTradeClose(tradeId: string, exchange: ExchangeId, symbol: string, strategyId: string): Promise<void> {
  if (closeWatchers.has(tradeId)) return;
  closeWatchers.add(tradeId);
  const startedAt = Date.now();
  const maxWaitMs = 7 * 24 * 60 * 60 * 1_000;
  try {
    while (Date.now() - startedAt < maxWaitMs) {
      await delay(30_000);
      try {
        const trade = await prisma.trade.findUnique({ where: { id: tradeId }, select: { status: true } });
        if (!trade || ["CLOSED", "CANCELLED", "ERROR"].includes(trade.status)) {
          coordinator.close(exchange, symbol, strategyId);
          return;
        }
      } catch (error) {
        log.warn({ error, tradeId }, "watchTradeClose poll failed");
      }
    }
    coordinator.close(exchange, symbol, strategyId);
    log.warn({ tradeId, symbol }, "watchTradeClose timed out; coordinator forcibly cleared");
  } finally {
    closeWatchers.delete(tradeId);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

async function refreshControl(): Promise<void> {
  const state = await prisma.botState.findUnique({ where: { id: "singleton" } });
  if (state?.status && state.status !== status) {
    status = state.status as BotStatus;
    if (status === "STOPPED") {
      for (const context of contexts.values()) context.circuitBreaker.trip(state.reason ?? "Kill switch");
      await Promise.all(symbols.map((symbol) => client.cancelAll(symbol)));
    } else if (status === "RUNNING") {
      for (const context of contexts.values()) context.circuitBreaker.reset();
    }
  }
}

async function refreshMetrics(): Promise<void> {
  const snapshots = [...contexts.values()].map((context) => ({ symbol: `${context.exchange}:${context.symbol}`, ...context.adaptive.snapshot }));
  const primary = snapshots[0];
  if (primary) await metrics.collect(status, primary.regime, primary.config, snapshots);
}

async function shutdown(signal: string): Promise<void> {
  status = "STOPPED";
  websocket.close();
  binanceWebsocket.close();
  await Promise.allSettled(strategies.map((strategy) => strategy.stop()));
  await prisma.botState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", status, reason: signal },
    update: { status, reason: signal },
  });
  const deadline = Date.now() + 30_000;
  while (processing.size && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  await prisma.botEvent.create({ data: { type: "STOPPED", message: `Graceful shutdown: ${signal}` } });
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
void bootstrap().catch((error) => {
  premiumLog("engine", "engine_startup_failed", { error }, "fatal", "Engine startup failed");
  log.fatal({ error }, "startup failed");
  process.exit(1);
});
