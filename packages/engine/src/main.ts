import { randomUUID } from "node:crypto";
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
import { recordClosedTradeForCircuitBreakers } from "./signals/TradeCloseCircuitBreaker.js";
import { MLScorer } from "./signals/MLScorer.js";
import { SignalEngine } from "./signals/SignalEngine.js";
import { MLTrainer } from "./signals/MLTrainer.js";
import { createStrategy } from "./strategies/StrategyFactory.js";
import { StrategyCoordinator } from "./strategies/StrategyCoordinator.js";
import { restoreCoordinatorState } from "./strategies/StrategyCoordinatorRestore.js";
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
const binanceMarketDataTestnet = env.BINANCE_TESTNET && !binancePaper;
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
  binanceMarketDataTestnet,
  binancePaper,
  env.PAPER_FEE_RATE,
  env.PAPER_SLIPPAGE_BPS,
);
const binanceWebsocket = new BinanceWebSocket(binanceMarketDataTestnet);
const binanceAdapter = new BinanceAdapter(binanceRest, binanceWebsocket);
const exchanges = new ExchangeRouter([bybitAdapter, binanceAdapter]);
const telegram = new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
const discord = new DiscordNotifier(env.DISCORD_WEBHOOK_TRADES, env.DISCORD_WEBHOOK_ALERTS, env.DISCORD_WEBHOOK_DAILY);
const journal = new ExecutionJournal();
const stateMachine = new OrderStateMachine(journal);
const orderManager = new OrderManager(exchanges, stateMachine, journal, handleTradeClosed);
const reconciliation = new ReconciliationService(
  [bybitAdapter, binanceAdapter],
  journal,
  handleTradeClosed,
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
const paperProtectionProcessing = new Set<string>();
let lastStatusBlockAt = 0;
const PAPER_PROTECTION_INTERVAL_MS = 15_000;
const PAPER_TIMEOUT_MS = 6 * 60 * 60_000;
const PAPER_TRAILING_STOP_PCT = 1.5;
const PAPER_PARTIAL_TP_L1_R = 1.0;
const PAPER_PARTIAL_TP_L1_CLOSE_PCT = 20;
const PAPER_PARTIAL_TP_L2_R = 2.0;
const PAPER_PARTIAL_TP_L2_CLOSE_PCT = 20;
const PAPER_BREAKEVEN_BUFFER_R = 0.1;
const PAPER_DANGER_ALERT_R = -0.8;
const AUTO_TRAINING_INTERVAL_MS = 30 * 60_000;
const AUTO_OPTIMIZER_INTERVAL_MS = 15 * 60_000;
const MARKET_SCANNER_INTERVAL_MS = 5 * 60_000;
const SAFETY_SUPERVISOR_INTERVAL_MS = 10 * 60_000;
const HISTORICAL_CANDLE_FLUSH_INTERVAL_MS = 10_000;
const HISTORICAL_CANDLE_FLUSH_BATCH_SIZE = 500;

interface HistoricalCandlePersistInput {
  symbol: string;
  timeframe: string;
  openTime: number;
  closeTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  confirmed?: boolean;
}

async function handleTradeClosed(trade: Parameters<TelegramNotifier["tradeClosed"]>[0]): Promise<void> {
  const updatedContexts = recordClosedTradeForCircuitBreakers(contexts.values(), trade);
  for (const context of updatedContexts) {
    const breakerState = context.circuitBreaker.state;
    if (breakerState.active) {
      operatorLog(
        "WARNING",
        `CIRCUIT BREAKER | ${context.exchange.toUpperCase()}:${context.symbol}`,
        breakerState.reason ?? "Circuit breaker active after closed trade",
      );
      await journal.record("CIRCUIT_BREAKER_TRIPPED", {
        exchange: context.exchange,
        symbol: context.symbol,
        reason: breakerState.reason,
        consecutiveLosses: breakerState.consecutiveLosses,
        blockedUntil: breakerState.blockedUntil?.toISOString(),
        remainingCooldownMinutes: breakerState.remainingCooldownMs === undefined
          ? undefined
          : Math.ceil(breakerState.remainingCooldownMs / 60_000),
        pnlUsdt: trade.pnlUsdt,
      });
    }
  }
  try {
    await telegram.tradeClosed(trade);
  } catch (error) {
    log.warn({ error, symbol: trade.symbol }, "telegram trade-close notification failed");
  }
}

const historicalCandleQueue = new Map<string, HistoricalCandlePersistInput>();
let historicalCandleFlushInFlight = false;

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

type PaperProtectionState = {
  initialPositionSizeUsdt?: number;
  initialStopLoss?: number;
  partialRealizedPnlUsdt?: number;
  partialFeeUsdt?: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  breakevenMoved?: boolean;
  trailingActivated?: boolean;
  dangerAlerted?: boolean;
  highestPrice?: number;
  lowestPrice?: number;
  currentPrice?: number;
  unrealizedPnlUsdt?: number;
  profitR?: number;
};

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
  if (typeof details.baseMinimumScore === "number" && details.baseMinimumScore !== details.minimumScore) {
    parts.push(`Base min: ${formatMaybeNumber(details.baseMinimumScore, 0)}`);
  }
  if (typeof details.idleHours === "number") parts.push(`Idle: ${formatMaybeNumber(details.idleHours, 1)}h`);
  if (typeof details.requiredAdx === "number") parts.push(`Need ADX: ${formatMaybeNumber(details.requiredAdx, 1)}`);
  if (typeof details.adx === "number") parts.push(`ADX: ${formatMaybeNumber(details.adx, 1)}`);
  if (typeof details.rsi === "number") parts.push(`RSI: ${formatMaybeNumber(details.rsi, 1)}`);
  if (typeof details.volumeRatio === "number") parts.push(`Vol: ${formatMaybeNumber(details.volumeRatio, 2)}x`);
  if (typeof details.choppiness === "number") parts.push(`Chop: ${formatMaybeNumber(details.choppiness, 1)}`);
  if (typeof details.momentumSpikePct === "number") parts.push(`Spike: ${formatMaybeNumber(details.momentumSpikePct, 2)}%`);
  if (typeof details.h1Trend === "string") parts.push(`H1: ${details.h1Trend}${details.h1Conflict ? " conflict" : ""}`);
  if (typeof details.btcTrend === "string" && details.btcTrend !== "NEUTRAL") parts.push(`BTC: ${details.btcTrend}${details.btcConflict ? " conflict" : ""}`);
  if (typeof details.baseScore === "number") parts.push(`Base: ${formatMaybeNumber(details.baseScore, 0)}`);
  if (details.rangingOverride === true) parts.push("Paper idle override: ON");
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
  watchTradeClose,
  notifyTradeOpened: (symbol, signal, size, leverage) => telegram.tradeOpened(symbol, signal, size, leverage),
  notifyAlert: (title, details, dedupeKey) => telegram.alert(title, details, dedupeKey),
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
  void runAutoTraining("startup");
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
  setInterval(() => void flushHistoricalCandleQueue(), HISTORICAL_CANDLE_FLUSH_INTERVAL_MS).unref();
  void flushHistoricalCandleQueue();
  if (env.ENGINE_LOG_HEARTBEAT_SECONDS > 0) {
    const heartbeatSeconds = env.NODE_ENV === "production"
      ? Math.max(300, env.ENGINE_LOG_HEARTBEAT_SECONDS)
      : env.ENGINE_LOG_HEARTBEAT_SECONDS;
    setInterval(() => void logEngineHeartbeat(), heartbeatSeconds * 1_000).unref();
    void logEngineHeartbeat();
  }
  setInterval(() => void monitorPaperProtections(), PAPER_PROTECTION_INTERVAL_MS).unref();
  void monitorPaperProtections();
  setInterval(() => void runAutoOptimizer(), AUTO_OPTIMIZER_INTERVAL_MS).unref();
  void runAutoOptimizer();
  setInterval(() => void runMarketScanner(), MARKET_SCANNER_INTERVAL_MS).unref();
  void runMarketScanner();
  setInterval(() => void runSafetySupervisor(), SAFETY_SUPERVISOR_INTERVAL_MS).unref();
  void runSafetySupervisor();
  setInterval(() => void runAutoTraining("scheduled"), AUTO_TRAINING_INTERVAL_MS).unref();
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
    binanceMarketData: binanceMarketDataTestnet ? "testnet" : "mainnet",
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
    ["Binance market data", binanceMarketDataTestnet ? "testnet" : "mainnet"],
    ["Telegram", telegram.configured ? "connected" : "disabled"],
  ]);
  if (telegram.configured && await shouldSendStartupTelegram()) {
    const breakerSummary = [...contexts.values()]
      .map((context) => {
        const breaker = context.circuitBreaker.state;
        return `${context.symbol}:${breaker.active ? breaker.reason ?? "blocked" : "OK"}`;
      })
      .join(" | ");
    await telegram.send([
      "\u{1F916} <b>OBSIDRA BOT ON</b>",
      "Status: <b>RUNNING ✅</b>",
      `Mode: <b>${bybitPaper && binancePaper ? "PAPER" : executionEnvironmentLabel()}</b>`,
      `Strategies: <b>${activeDescriptors.map((item) => `${item.type}:${item.symbol}`).join(", ") || "none"}</b>`,
      `Circuit breakers: <b>${breakerSummary || "OK"}</b>`,
      "Dashboard: <b>/status pentru raport manual</b>",
    ].join("\n"), { dedupeKey: "startup:bot-on", dedupeMs: 30 * 60_000 }).then(() => recordStartupTelegramSent()).catch((error) => log.warn({ error }, "startup Telegram notification failed"));
  }
}

async function shouldSendStartupTelegram(): Promise<boolean> {
  const recent = await prisma.botEvent.findFirst({
    where: {
      type: "TELEGRAM_BOT_ON_SENT",
      createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return !recent;
}

async function recordStartupTelegramSent(): Promise<void> {
  await prisma.botEvent.create({
    data: {
      type: "TELEGRAM_BOT_ON_SENT",
      message: "Startup Telegram notification sent",
      data: { dedupeMinutes: 30 },
    },
  });
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
    const normalized = {
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
    };
    binanceStore.addCandle(normalized);
    void persistHistoricalCandle(normalized);
  } else {
    void persistHistoricalCandle({
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
  await restoreCoordinatorState({
    prisma,
    coordinator,
    descriptors,
    watchTradeClose: (trade) => void watchTradeClose(trade.id, trade.exchange as ExchangeId, trade.symbol, trade.strategyId),
  });
}

async function warmMarketData(): Promise<void> {
  for (const context of contexts.values()) {
    try {
      for (const timeframe of ["1", "3", "15", "60", "240"]) {
        const candles = await context.adapter.getHistoricalCandles(context.symbol, timeframe, 200);
        for (const candle of candles) {
          const normalized = {
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
          };
          context.store.addCandle(normalized);
          void persistHistoricalCandle(normalized);
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
    await journal.record(evaluation.signal ? "SIGNAL_READY" : "SIGNAL_SKIPPED", {
      exchange,
      symbol,
      reason: evaluation.reason,
      details: evaluation.details,
      ...(evaluation.signal ? {
        signal: {
          direction: evaluation.signal.direction,
          score: evaluation.signal.score,
          confidence: evaluation.signal.confidence,
          entryPrice: evaluation.signal.entryPrice,
          stopLoss: evaluation.signal.stopLoss,
          takeProfit: evaluation.signal.takeProfit,
          regime: evaluation.signal.regime,
        },
      } : {}),
    });
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
      operatorLog("WARNING", `RISK BLOCKED | ${symbol}`, decision.reason ?? "Risk engine rejected signal");
      log.info({ exchange, symbol, reason: decision.reason }, "signal rejected");
      return;
    }
    operatorLog("INFO", `RISK APPROVED | ${symbol}`, `Size ${decision.positionSizeUsdt.toFixed(2)} USDT | ${decision.leverage}x | SL $${decision.stopLossPrice.toFixed(4)} | TP $${decision.takeProfitPrice.toFixed(4)}`);
    const strategyId = trendDescriptor.id;
    const conflictDecision = coordinator.check(exchange, symbol, "TREND", signal.direction, decision.positionSizeUsdt, strategyId);
    if (!conflictDecision.approved) {
      await journal.record("RISK_REJECTED", { signal, decision: conflictDecision });
      operatorLog("WARNING", `RISK BLOCKED | ${symbol}`, conflictDecision.reason ?? "Strategy conflict guard rejected trade");
      return;
    }
    const portfolioDecision = await portfolio.approve(exchange, symbol, decision.positionSizeUsdt);
    if (!portfolioDecision.approved) {
      await journal.record("RISK_REJECTED", { signal, decision: portfolioDecision });
      const reason = "reason" in portfolioDecision ? portfolioDecision.reason : "Portfolio exposure guard rejected trade";
      operatorLog("WARNING", `RISK BLOCKED | ${symbol}`, reason);
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
      /*
       * Telegram clean mode: exchange errors stay in Railway logs/Discord only.
       * Telegram is reserved for BOT ON, SIGNAL, WIN/LOSS and manual commands.
      await telegram.alert(
        `Exchange error: ${exchange.toUpperCase()}`,
        `${symbol}: ${error.message}. Botul rămâne online și va reîncerca.`,
        `${exchange}:${error.code}`,
      ).catch((telegramError) => log.warn({ error: telegramError }, "Telegram exchange alert failed"));
       */
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
        circuitBreakerReason: context.circuitBreaker.state.reason ?? null,
        circuitBreakerRemainingMinutes: context.circuitBreaker.state.remainingCooldownMs === undefined
          ? null
          : Math.ceil(context.circuitBreaker.state.remainingCooldownMs / 60_000),
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
    const now = Date.now();
    const shouldPrintStatusBlock = openTrades.length > 0 || now - lastStatusBlockAt >= 5 * 60_000;
    if (!shouldPrintStatusBlock) return;
    lastStatusBlockAt = now;
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
      ["Signals ready 24h", currentMetrics?.signalsGenerated24h ?? 0],
      ["Signals skipped 24h", currentMetrics?.signalsRejected24h ?? 0],
      ["Active Trades", openTrades.length],
      ...tradeRows,
      ["Next scan", "waiting for confirmed 15m candle"],
    ]);
  } catch (error) {
    premiumLog("engine", "engine_heartbeat_failed", { error }, "warn", "Bot heartbeat collection failed");
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

async function runAutoTraining(trigger: "startup" | "scheduled" | "manual" = "scheduled"): Promise<void> {
  const uniqueSymbols = [...new Set([...contexts.values()].map((context) => context.symbol))];
  for (const symbol of uniqueSymbols) {
    try {
      const result = await trainer.train(symbol);
      await journal.record(result.trained ? "ML_TRAINING_COMPLETED" : "ML_TRAINING_SKIPPED", {
        trigger,
        symbol,
        savedWeights: result.savedWeights,
        tradeCount: result.tradeCount,
        datasetSize: result.datasetSize,
        cvAccuracy: result.cvAccuracy,
        cvLogLoss: result.cvLogLoss,
        wfEfficiency: result.wfEfficiency,
        reason: result.reason,
      });
      await prisma.botEvent.create({
        data: {
          type: result.trained ? "ML_TRAINING_COMPLETED" : "ML_TRAINING_SKIPPED",
          symbol,
          message: result.trained
            ? `Auto-training completed for ${symbol}: accuracy ${((result.cvAccuracy ?? 0) * 100).toFixed(1)}%, saved=${result.savedWeights}`
            : `Auto-training skipped for ${symbol}: ${result.reason}`,
          data: { trigger, ...result },
        },
      });
      if (result.savedWeights) {
        await Promise.all([...contexts.values()].filter((context) => context.symbol === symbol).map((context) => context.ml.initialize()));
        operatorLog("INFO", `AI TRAINING | ${symbol}`, `New ML model loaded | accuracy ${((result.cvAccuracy ?? 0) * 100).toFixed(1)}% | trades ${result.tradeCount}`);
        /*
         * Telegram clean mode: ML training updates stay in logs only.
         * Telegram is reserved for BOT ON, SIGNAL, WIN/LOSS and manual commands.
        if (telegram.configured) {
          await telegram.alert(
            "AI auto-training updated",
            `${symbol}: model nou incarcat | accuracy ${((result.cvAccuracy ?? 0) * 100).toFixed(1)}% | trades ${result.tradeCount}`,
            `ml-training:${symbol}:${result.tradeCount}`,
          );
        }
         */
      } else if (result.trained) {
        operatorLog("INFO", `AI TRAINING | ${symbol}`, `Model tested but not saved | ${result.reason} | accuracy ${((result.cvAccuracy ?? 0) * 100).toFixed(1)}%`);
      }
    } catch (error) {
      log.warn({ error, symbol, trigger }, "ML auto-training failed");
      await journal.record("ML_TRAINING_FAILED", { trigger, symbol, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function runAutoOptimizer(): Promise<void> {
  const uniqueSymbols = [...new Set([...contexts.values()].map((context) => context.symbol))];
  for (const symbol of uniqueSymbols) {
    try {
      const trades = await prisma.trade.findMany({
        where: {
          symbol,
          executionMode: "PAPER",
          status: "CLOSED",
          pnlUsdt: { not: null },
          closedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
        orderBy: { closedAt: "desc" },
        take: 30,
        select: { pnlUsdt: true, feeUsdt: true, signalScore: true },
      });
      if (trades.length < 10) {
        await journal.record("AI_OPTIMIZER_SKIPPED", { symbol, reason: "Not enough recent closed paper trades", tradeCount: trades.length });
        continue;
      }
      const pnl = trades.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
      const wins = trades.filter((trade) => (trade.pnlUsdt ?? 0) > 0).length;
      const winRate = wins / trades.length;
      const lossStreak = trades.findIndex((trade) => (trade.pnlUsdt ?? 0) > 0);
      const consecutiveLosses = lossStreak === -1 ? trades.length : lossStreak;
      const averageScore = trades.reduce((sum, trade) => sum + trade.signalScore, 0) / trades.length;
      const contextsForSymbol = [...contexts.values()].filter((context) => context.symbol === symbol);
      const current = contextsForSymbol[0]?.adaptive.snapshot.config;
      if (!current) continue;

      let mode: "DEFENSIVE" | "AGGRESSIVE" | "STEADY" = "STEADY";
      let reason = "Recent paper performance is stable";
      const bias = { ...current };
      if (pnl < 0 || winRate < 0.42 || consecutiveLosses >= 3) {
        mode = "DEFENSIVE";
        reason = `Protecting capital: pnl=${pnl.toFixed(2)}, winRate=${(winRate * 100).toFixed(1)}%, lossStreak=${consecutiveLosses}`;
        bias.minSignalScore = Math.min(85, Math.max(current.minSignalScore + 5, averageScore + 3));
        bias.maxPositionPct = Math.max(0.5, current.maxPositionPct * 0.75);
        bias.leverageMax = Math.max(1, Math.min(current.leverageMax, 3));
        bias.trailingStopPct = Math.max(1, current.trailingStopPct * 0.9);
      } else if (pnl > 0 && winRate >= 0.58 && consecutiveLosses === 0) {
        mode = "AGGRESSIVE";
        reason = `Scaling carefully: pnl=${pnl.toFixed(2)}, winRate=${(winRate * 100).toFixed(1)}%`;
        bias.minSignalScore = Math.max(58, current.minSignalScore - 2);
        bias.maxPositionPct = Math.min(3, current.maxPositionPct * 1.1);
        bias.tpMultiplier = Math.min(4, current.tpMultiplier * 1.05);
      }

      await Promise.all(contextsForSymbol.map((context) => context.adaptive.applyOptimizer(reason, bias)));
      await journal.record("AI_OPTIMIZER_APPLIED", {
        symbol,
        mode,
        reason,
        tradeCount: trades.length,
        pnl,
        winRate,
        consecutiveLosses,
        averageScore,
        config: bias,
      });
      await prisma.botEvent.create({
        data: {
          type: "AI_OPTIMIZER_APPLIED",
          symbol,
          message: `${symbol} brain mode ${mode}: ${reason}`,
          data: { mode, reason, tradeCount: trades.length, pnl, winRate, consecutiveLosses, averageScore, config: bias },
        },
      });
      operatorLog("INFO", `AI BRAIN | ${symbol}`, `${mode} | ${reason}`);
    } catch (error) {
      log.warn({ error, symbol }, "AI optimizer failed");
      await journal.record("AI_OPTIMIZER_FAILED", { symbol, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function runMarketScanner(): Promise<void> {
  try {
    const scans = [...contexts.values()].map((context) => {
      const candles15 = context.store.getCandles(context.symbol, "15", 80);
      const candles240 = context.store.getCandles(context.symbol, "240", 80);
      const ticker = context.store.getTicker(context.symbol);
      const closes15 = candles15.map((candle) => candle.close);
      const closes240 = candles240.map((candle) => candle.close);
      const price = ticker?.price ?? closes15.at(-1) ?? 0;
      const volumeNow = candles15.at(-1)?.volume ?? 0;
      const avgVolume = average(candles15.slice(-20).map((candle) => candle.volume));
      const volatility = price > 0 ? average(candles15.slice(-20).map((candle) => (candle.high - candle.low) / price)) * 100 : 0;
      const fast = average(closes240.slice(-21));
      const slow = average(closes240.slice(-55));
      const trendPct = price > 0 ? Math.abs(fast - slow) / price * 100 : 0;
      const volumeScore = avgVolume > 0 ? Math.min(30, (volumeNow / avgVolume) * 15) : 0;
      const trendScore = Math.min(35, trendPct * 140);
      const volatilityScore = volatility >= 0.15 && volatility <= 2.8 ? 25 : volatility < 0.15 ? 8 : 12;
      const dataScore = Math.min(10, ((candles15.length + candles240.length) / 160) * 10);
      const score = Math.round(Math.max(0, Math.min(100, volumeScore + trendScore + volatilityScore + dataScore)));
      const direction = fast > slow ? "LONG" : fast < slow ? "SHORT" : "NEUTRAL";
      return {
        exchange: context.exchange,
        symbol: context.symbol,
        score,
        direction,
        price,
        volumeRatio: avgVolume > 0 ? volumeNow / avgVolume : 0,
        volatilityPct: volatility,
        trendPct,
        reason: score >= 70 ? "High quality market" : score >= 50 ? "Watchlist candidate" : "Low priority",
        candleCount15m: candles15.length,
        candleCount4h: candles240.length,
      };
    }).sort((a, b) => b.score - a.score);
    await journal.record("AI_MARKET_SCAN", { markets: scans, best: scans[0] ?? null });
    await prisma.botEvent.create({
      data: {
        type: "AI_MARKET_SCAN",
        symbol: scans[0]?.symbol ?? null,
        message: scans[0] ? `Best market: ${scans[0].symbol} score ${scans[0].score}` : "Market scanner has no candidates",
        data: { markets: scans.slice(0, 10) },
      },
    });
    if (scans[0]) operatorLog("INFO", "AI MARKET SCANNER", `${scans[0].symbol} score ${scans[0].score} | ${scans[0].reason}`);
  } catch (error) {
    log.warn({ error }, "market scanner failed");
  }
}

async function runSafetySupervisor(): Promise<void> {
  try {
    const since24h = new Date(Date.now() - 86_400_000);
    const since6h = new Date(Date.now() - 6 * 3_600_000);
    const [recentClosed, latestClosed, failedEvents, openTrades, readySignals, skippedSignals] = await Promise.all([
      prisma.trade.findMany({ where: { status: "CLOSED", closedAt: { gte: since24h }, pnlUsdt: { not: null } }, select: { pnlUsdt: true } }),
      prisma.trade.findMany({ where: { status: "CLOSED", pnlUsdt: { not: null } }, orderBy: { closedAt: "desc" }, take: 10, select: { pnlUsdt: true } }),
      prisma.journalEntry.count({ where: { type: { contains: "FAILED" }, createdAt: { gte: since6h } } }),
      prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } }, select: { positionSizeUsdt: true } }),
      prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_READY", "SIGNAL_GENERATED"] }, createdAt: { gte: since24h } } }),
      prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_SKIPPED", "RISK_REJECTED"] }, createdAt: { gte: since24h } } }),
    ]);
    const recentPnl = recentClosed.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
    const lossStreakIndex = latestClosed.findIndex((trade) => (trade.pnlUsdt ?? 0) > 0);
    const consecutiveLosses = lossStreakIndex === -1 ? latestClosed.length : lossStreakIndex;
    const exposure = openTrades.reduce((sum, trade) => sum + trade.positionSizeUsdt, 0);
    const danger = recentPnl < -25 || consecutiveLosses >= 4 || failedEvents >= 5;
    const watch = danger || recentPnl < 0 || consecutiveLosses >= 2 || failedEvents >= 2 || (readySignals === 0 && skippedSignals === 0);
    const level = danger ? "DANGER" : watch ? "WATCH" : "OK";
    const summary = `${level} | pnl24h ${recentPnl.toFixed(2)} USDT | losses ${consecutiveLosses} | failed ${failedEvents} | exposure ${exposure.toFixed(2)} USDT`;
    await journal.record("AI_SAFETY_SUPERVISOR", {
      level,
      recentPnl,
      consecutiveLosses,
      failedEvents,
      openPositions: openTrades.length,
      exposure,
      readySignals,
      skippedSignals,
      summary,
    });
    await prisma.botEvent.create({
      data: {
        type: "AI_SAFETY_SUPERVISOR",
        message: summary,
        data: { level, recentPnl, consecutiveLosses, failedEvents, openPositions: openTrades.length, exposure, readySignals, skippedSignals },
      },
    });
    operatorLog(level === "DANGER" ? "WARNING" : "INFO", "AI SAFETY SUPERVISOR", summary);
    /*
     * Telegram clean mode: safety supervisor alerts stay in logs/dashboard.
     * Telegram is reserved for BOT ON, SIGNAL, WIN/LOSS and manual commands.
    if (level === "DANGER" && telegram.configured) {
      await telegram.alert("AI Safety Supervisor", summary, `safety:${level}:${consecutiveLosses}:${failedEvents}`);
    }
     */
  } catch (error) {
    log.warn({ error }, "safety supervisor failed");
  }
}

function persistHistoricalCandle(candle: HistoricalCandlePersistInput): void {
  if (!Number.isFinite(candle.openTime) || !Number.isFinite(candle.close)) return;
  historicalCandleQueue.set(`${candle.symbol}:${candle.timeframe}:${candle.openTime}`, candle);
}

async function flushHistoricalCandleQueue(): Promise<void> {
  if (historicalCandleFlushInFlight || historicalCandleQueue.size === 0) return;
  historicalCandleFlushInFlight = true;
  const batch = [...historicalCandleQueue.entries()].slice(0, HISTORICAL_CANDLE_FLUSH_BATCH_SIZE);
  for (const [key] of batch) historicalCandleQueue.delete(key);
  try {
    await prisma.historicalCandle.createMany({
      data: batch.map(([, candle]) => ({
        symbol: candle.symbol,
        interval: candle.timeframe,
        openTime: BigInt(candle.openTime),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        turnover: 0,
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    for (const [key, candle] of batch) historicalCandleQueue.set(key, candle);
    log.warn({ error, count: batch.length, queued: historicalCandleQueue.size }, "historical candle batch persist failed");
  } finally {
    historicalCandleFlushInFlight = false;
  }
}

async function monitorPaperProtections(): Promise<void> {
  const trades = await prisma.trade.findMany({
    where: {
      executionMode: "PAPER",
      status: { in: ["OPEN", "FILLED"] },
      openedAt: { not: null },
      entryPrice: { not: null },
    },
    orderBy: { openedAt: "asc" },
    take: 50,
  });
  for (const trade of trades) {
    if (paperProtectionProcessing.has(trade.id)) continue;
    paperProtectionProcessing.add(trade.id);
    void protectPaperTrade(trade.id).finally(() => paperProtectionProcessing.delete(trade.id));
  }
}

async function protectPaperTrade(tradeId: string): Promise<void> {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade || !["OPEN", "FILLED"].includes(trade.status) || !trade.openedAt || !trade.entryPrice) return;
    const exchange = trade.exchange as ExchangeId;
    const context = getOrCreateContext(exchange, trade.symbol);
    const ticker = context.store.getTicker(trade.symbol);
    const price = ticker?.price;
    if (!price || !Number.isFinite(price) || price <= 0) return;

    const isLong = trade.direction === "LONG";
    const protection = paperProtectionState(trade.signalData);
    protection.initialPositionSizeUsdt ??= trade.positionSizeUsdt;
    protection.initialStopLoss ??= trade.stopLoss;
    protection.highestPrice = Math.max(protection.highestPrice ?? trade.entryPrice, price);
    protection.lowestPrice = Math.min(protection.lowestPrice ?? trade.entryPrice, price);

    const hitStop = isLong ? price <= trade.stopLoss : price >= trade.stopLoss;
    const hitTakeProfit = isLong ? price >= trade.takeProfit : price <= trade.takeProfit;
    const paperTimeoutMs = paperTimeoutMsForTrade(trade.signalData);
    const timedOut = Date.now() - trade.openedAt.getTime() >= paperTimeoutMs;
    const entry = trade.entryPrice;
    const initialStop = protection.initialStopLoss ?? trade.stopLoss;
    const initialRiskDistance = Math.abs(entry - initialStop);
    const favorableMove = isLong ? price - entry : entry - price;
    const quantity = entry > 0 ? (trade.positionSizeUsdt * trade.leverage) / entry : 0;
    protection.currentPrice = price;
    protection.unrealizedPnlUsdt = quantity > 0 ? (isLong ? price - entry : entry - price) * quantity : 0;
    protection.profitR = initialRiskDistance > 0 ? favorableMove / initialRiskDistance : 0;
    await persistPaperProtectionState(trade.id, trade.signalData, protection);
    if (protection.profitR <= PAPER_DANGER_ALERT_R && !protection.dangerAlerted) {
      protection.dangerAlerted = true;
      await persistPaperProtectionState(trade.id, trade.signalData, protection);
      await journal.record("PAPER_POSITION_DANGER", {
        symbol: trade.symbol,
        exchange,
        direction: trade.direction,
        price,
        entryPrice: entry,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        unrealizedPnlUsdt: protection.unrealizedPnlUsdt,
        profitR: protection.profitR,
        reason: "near_stop_loss",
      }, trade.id);
      operatorLog(
        "WARNING",
        `POSITION DANGER | ${trade.symbol}`,
        `Near SL: ${protection.profitR.toFixed(2)}R | PnL ${protection.unrealizedPnlUsdt.toFixed(2)} USDT | price $${price.toFixed(4)} | SL $${trade.stopLoss.toFixed(4)}`,
      );
      // Telegram clean mode: position danger stays in Railway/dashboard.
      // Telegram is reserved for BOT ON, valid signals, trade WIN/LOSS and manual commands.
    }

    if (hitStop) {
      await orderManager.close(trade.id, "paper_stop_loss");
      return;
    }
    if (hitTakeProfit) {
      await orderManager.close(trade.id, "paper_take_profit");
      return;
    }

    if (initialRiskDistance <= 0) return;
    const profitR = favorableMove / initialRiskDistance;

    if (!protection.tp1Hit && profitR >= PAPER_PARTIAL_TP_L1_R) {
      await closePaperPartial(trade.id, PAPER_PARTIAL_TP_L1_CLOSE_PCT, price, "paper_partial_tp1");
      return;
    }
    if (protection.tp1Hit && !protection.tp2Hit && profitR >= PAPER_PARTIAL_TP_L2_R) {
      await closePaperPartial(trade.id, PAPER_PARTIAL_TP_L2_CLOSE_PCT, price, "paper_partial_tp2");
      return;
    }
    if (timedOut) {
      await orderManager.close(trade.id, "paper_timeout_exit");
      return;
    }

    const currentStop = trade.stopLoss;
    if (favorableMove <= 0) return;

    let nextStop = currentStop;
    let reason: string | null = null;
    const breakevenEligible = profitR >= PAPER_PARTIAL_TP_L1_R || protection.tp1Hit;
    if (breakevenEligible) {
      const breakevenBuffer = initialRiskDistance * PAPER_BREAKEVEN_BUFFER_R;
      const breakevenStop = isLong ? entry + breakevenBuffer : entry - breakevenBuffer;
      const improvesStop = isLong ? breakevenStop > nextStop : breakevenStop < nextStop;
      if (improvesStop) {
        nextStop = breakevenStop;
        reason = "paper_breakeven_stop";
        protection.breakevenMoved = true;
      }
    }

    if (profitR >= PAPER_PARTIAL_TP_L2_R || protection.tp2Hit) {
      const extreme = isLong ? protection.highestPrice ?? price : protection.lowestPrice ?? price;
      const trailingStop = isLong
        ? extreme * (1 - PAPER_TRAILING_STOP_PCT / 100)
        : extreme * (1 + PAPER_TRAILING_STOP_PCT / 100);
      const improvesTrailing = isLong ? trailingStop > nextStop : trailingStop < nextStop;
      if (improvesTrailing) {
        nextStop = trailingStop;
        reason = "paper_trailing_stop";
        protection.trailingActivated = true;
      }
    }

    if (reason && Math.abs(nextStop - currentStop) / currentStop >= 0.0001) {
      await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: nextStop, signalData: jsonValue(mergePaperProtectionState(trade.signalData, protection)) } });
      await journal.record("PAPER_PROTECTION_UPDATED", {
        symbol: trade.symbol,
        exchange,
        direction: trade.direction,
        price,
        previousStop: currentStop,
        nextStop,
        reason,
      }, trade.id);
      operatorLog("INFO", `PAPER PROTECTION | ${trade.symbol}`, `${reason}: SL moved to $${nextStop.toFixed(4)} | price $${price.toFixed(4)}`);
    }
  } catch (error) {
    log.warn({ error, tradeId }, "paper protection monitor failed");
  }
}

function paperProtectionState(signalData: unknown): PaperProtectionState {
  if (!signalData || typeof signalData !== "object") return {};
  const value = (signalData as Record<string, unknown>).paperProtection;
  return value && typeof value === "object" ? { ...(value as PaperProtectionState) } : {};
}

function paperTimeoutMsForTrade(signalData: unknown): number {
  if (!signalData || typeof signalData !== "object") return PAPER_TIMEOUT_MS;
  const indicators = (signalData as Record<string, unknown>).indicators;
  if (!indicators || typeof indicators !== "object") return PAPER_TIMEOUT_MS;
  const record = indicators as Record<string, unknown>;
  const maxHoldCandles = typeof record.maxHoldCandles === "number" && Number.isFinite(record.maxHoldCandles)
    ? record.maxHoldCandles
    : null;
  const timeframeMinutes = typeof record.timeframeMinutes === "number" && Number.isFinite(record.timeframeMinutes)
    ? record.timeframeMinutes
    : null;
  if (!maxHoldCandles || !timeframeMinutes) return PAPER_TIMEOUT_MS;
  const strategyTimeoutMs = maxHoldCandles * timeframeMinutes * 60_000;
  return Math.max(PAPER_TIMEOUT_MS, Math.min(strategyTimeoutMs, 14 * 24 * 60 * 60_000));
}

function mergePaperProtectionState(signalData: unknown, protection: PaperProtectionState): Record<string, unknown> {
  const base = signalData && typeof signalData === "object" ? { ...(signalData as Record<string, unknown>) } : {};
  return { ...base, paperProtection: protection };
}

function jsonValue(value: unknown): never {
  return JSON.parse(JSON.stringify(value)) as never;
}

async function persistPaperProtectionState(tradeId: string, signalData: unknown, protection: PaperProtectionState): Promise<void> {
  await prisma.trade.update({
    where: { id: tradeId },
    data: { signalData: jsonValue(mergePaperProtectionState(signalData, protection)) },
  });
}

async function closePaperPartial(tradeId: string, closePct: number, markPrice: number, reason: "paper_partial_tp1" | "paper_partial_tp2"): Promise<void> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade || !["OPEN", "FILLED"].includes(trade.status) || !trade.entryPrice || trade.positionSizeUsdt <= env.MIN_POSITION_USDT) return;
  const exchange = trade.exchange as ExchangeId;
  const adapter = exchanges.get(exchange);
  const closeSizeUsdt = Math.min(
    trade.positionSizeUsdt - env.MIN_POSITION_USDT,
    trade.positionSizeUsdt * (closePct / 100),
  );
  if (closeSizeUsdt <= 0) return;
  const qty = (closeSizeUsdt * trade.leverage) / trade.entryPrice;
  const result = await exchanges.placeOrder(exchange, {
    symbol: trade.symbol,
    side: trade.direction === "LONG" ? "Sell" : "Buy",
    orderType: "Market",
    qty,
    reduceOnly: true,
    clientOrderId: `partial-${randomUUID()}`.slice(0, 36),
  });
  const exitPrice = result.avgFillPrice || markPrice;
  const grossPnl = trade.direction === "LONG"
    ? (exitPrice - trade.entryPrice) * qty
    : (trade.entryPrice - exitPrice) * qty;
  const netPnl = grossPnl - result.feeUsdt;
  const protection = paperProtectionState(trade.signalData);
  protection.initialPositionSizeUsdt ??= trade.positionSizeUsdt;
  protection.initialStopLoss ??= trade.stopLoss;
  protection.partialRealizedPnlUsdt = (protection.partialRealizedPnlUsdt ?? 0) + netPnl;
  protection.partialFeeUsdt = (protection.partialFeeUsdt ?? 0) + result.feeUsdt;
  if (reason === "paper_partial_tp1") protection.tp1Hit = true;
  if (reason === "paper_partial_tp2") protection.tp2Hit = true;
  const remainingSizeUsdt = Math.max(0, trade.positionSizeUsdt - closeSizeUsdt);
  const nextStop = reason === "paper_partial_tp1"
    ? (trade.direction === "LONG"
      ? Math.max(trade.stopLoss, trade.entryPrice + Math.abs(trade.entryPrice - (protection.initialStopLoss ?? trade.stopLoss)) * PAPER_BREAKEVEN_BUFFER_R)
      : Math.min(trade.stopLoss, trade.entryPrice - Math.abs(trade.entryPrice - (protection.initialStopLoss ?? trade.stopLoss)) * PAPER_BREAKEVEN_BUFFER_R))
    : trade.stopLoss;
  await prisma.trade.update({
    where: { id: trade.id },
    data: {
      positionSizeUsdt: remainingSizeUsdt,
      stopLoss: nextStop,
      feeUsdt: (trade.feeUsdt ?? 0) + result.feeUsdt,
      signalData: jsonValue(mergePaperProtectionState(trade.signalData, protection)),
    },
  });
  await journal.record("PAPER_PARTIAL_TAKE_PROFIT", {
    symbol: trade.symbol,
    exchange,
    direction: trade.direction,
    reason,
    closePct,
    closeSizeUsdt,
    remainingSizeUsdt,
    exitPrice,
    grossPnl,
    netPnl,
    feeUsdt: result.feeUsdt,
    stopLoss: nextStop,
    paperTrading: adapter.paperTrading,
  }, trade.id);
  operatorLog(
    "INFO",
    `PARTIAL TAKE PROFIT | ${trade.symbol}`,
    `${reason}: closed ${closePct}% | Net PnL ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT | Remaining ${remainingSizeUsdt.toFixed(2)} USDT | SL $${nextStop.toFixed(4)}`,
  );
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
