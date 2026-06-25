import { getEnv, moduleLogger, prisma, strategyCatalog, tradingSymbols, type BotStatus, type Direction } from "@obsidra/shared";
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
import { SymbolRegistry } from "./symbols/SymbolRegistry.js";

const env = getEnv();
const log = moduleLogger("engine");
const store = new MarketDataStore();
const symbols = tradingSymbols(env);
const descriptors = strategyCatalog(env);
const activeDescriptors = descriptors.filter((item) => item.enabled);
const bybitSymbols = activeDescriptors.filter((item) => item.exchange === "bybit" && item.symbol !== "MULTI").map((item) => item.symbol);
const marketSymbols = [...new Set([...symbols, ...bybitSymbols])];
const registry = new SymbolRegistry(symbols);
const bybitPaper = activeDescriptors.filter((item) => item.exchange === "bybit").every((item) => item.isPaperTrading);
const binancePaper = activeDescriptors.filter((item) => item.exchange === "binance").every((item) => item.isPaperTrading);
const client = new BybitRestClient(env.BYBIT_API_KEY_NEW || env.BYBIT_API_KEY, env.BYBIT_API_SECRET_NEW || env.BYBIT_API_SECRET, env.BYBIT_TESTNET, bybitPaper, env.MASTER_SECRET);
const websocket = new BybitWebSocket(store, marketSymbols, env.BYBIT_TESTNET);
const bybitAdapter = new BybitAdapter(client, websocket, store);
const binanceRest = new BinanceRestClient(env.BINANCE_API_KEY, env.BINANCE_API_SECRET, env.BINANCE_TESTNET, binancePaper);
const binanceWebsocket = new BinanceWebSocket(env.BINANCE_TESTNET);
const binanceAdapter = new BinanceAdapter(binanceRest, binanceWebsocket);
const exchanges = new ExchangeRouter([bybitAdapter, binanceAdapter]);
const journal = new ExecutionJournal();
const stateMachine = new OrderStateMachine(journal);
const orderManager = new OrderManager(exchanges, stateMachine, journal);
const preflight = new PreFlightCheck(store, client, env.SPREAD_MAX_PCT, bybitPaper);
const reconciliation = new ReconciliationService(client, journal);
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
const strategies = activeDescriptors.map((descriptor) => createStrategy({
  ...descriptor,
  status: descriptor.isPaperTrading ? "PAPER" : "RUNNING",
}));
const telegram = new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
const discord = new DiscordNotifier(env.DISCORD_WEBHOOK_TRADES, env.DISCORD_WEBHOOK_ALERTS, env.DISCORD_WEBHOOK_DAILY);
let status: BotStatus = "RUNNING";
const processing = new Set<string>();
const contexts = new Map(symbols.map((symbol) => {
  const adaptive = new AdaptiveParams(symbol);
  const circuitBreaker = new CircuitBreaker();
  const ml = new MLScorer(symbol);
  return [symbol, {
    adaptive,
    circuitBreaker,
    ml,
    signals: new SignalEngine(store, ml, adaptive, circuitBreaker),
    risk: new RiskEngine(env.DAILY_LOSS_LIMIT_USDT, env.WEEKLY_LOSS_LIMIT_USDT, env.MAX_DRAWDOWN_PCT, env.TRADING_POSITION_MAX_USDT, preflight, client, adaptive),
  }] as const;
}));

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  await prisma.botState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", status },
    update: { status, reason: env.PAPER_TRADING ? "Paper trading startup" : "Live startup" },
  });
  await prisma.botEvent.create({ data: { type: "STARTED", message: `Engine started (${env.PAPER_TRADING ? "paper" : "live"})` } });
  await Promise.all([...contexts.values()].map((context) => context.ml.initialize()));
  await Promise.all(symbols.map((symbol) => reconciliation.reconcile(symbol)));
  await restoreCoordinator();
  await Promise.all(strategies.map((strategy) => strategy.start()));
  subscribeStrategies();
  await warmMarketData();
  websocket.connect();
  startHealthServer(env.PORT + 1, () => metrics.latest);
  setInterval(refreshControl, 2_000).unref();
  setInterval(refreshMetrics, 300_000).unref();
  setInterval(() => void Promise.all(symbols.map((symbol) => trainer.train(symbol))), 3_600_000).unref();
  websocket.on("kline", (candle) => {
    if (candle.timeframe === "15" && candle.confirmed) void evaluate(candle.symbol);
  });
  websocket.on("fatal_disconnect", () => {
    status = "ERROR";
    for (const context of contexts.values()) context.circuitBreaker.trip("Bybit WebSocket disconnected");
    void discord.alert("Bybit WebSocket disconnected after five retries. Engine halted.");
  });
  log.info({ paperTrading: bybitPaper, symbols, strategies: activeDescriptors.map((item) => item.id) }, "engine started");
}

function subscribeStrategies(): void {
  for (const symbol of new Set(activeDescriptors.filter((item) => item.exchange === "bybit" && item.symbol !== "MULTI").map((item) => item.symbol))) {
    bybitAdapter.subscribeCandles(symbol, ["1", "15", "60", "240"], (candle) => void dispatchStrategyCandle("bybit", candle));
  }
  for (const symbol of new Set(activeDescriptors.filter((item) => item.exchange === "binance" && item.symbol !== "MULTI").map((item) => item.symbol))) {
    binanceAdapter.subscribeCandles(symbol, ["1", "15", "60", "240"], (candle) => void dispatchStrategyCandle("binance", candle));
  }
  binanceWebsocket.on("fatal", () => {
    log.error("Binance WebSocket reconnect exhausted");
    for (const strategy of strategies.filter((item) => item.config.exchange === "binance")) strategy.pause();
  });
}

async function dispatchStrategyCandle(exchange: "bybit" | "binance", candle: Parameters<typeof bybitAdapter.subscribeCandles>[2] extends (value: infer T) => void ? T : never): Promise<void> {
  if (!candle.confirmed) return;
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
  const open = await prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } });
  for (const trade of open) {
    const descriptor = descriptors.find((item) => item.id === trade.strategyId);
    coordinator.open(trade.exchange as "bybit" | "binance", trade.symbol, {
      strategyId: trade.strategyId,
      type: descriptor?.type ?? "TREND",
      direction: trade.direction as Direction,
      sizeUsdt: trade.positionSizeUsdt,
    });
  }
}

async function warmMarketData(): Promise<void> {
  for (const symbol of symbols) {
    try {
      for (const timeframe of ["1", "15", "60", "240"]) {
        const candles = await client.getKlines(symbol, timeframe, 200);
        for (const candle of candles) store.addCandle(candle);
      }
      log.info({ symbol }, "historical market data warmed");
    } catch (error) {
      log.warn({ symbol, error }, "market-data warmup failed; WebSocket accumulation will continue");
    }
  }
}

async function evaluate(symbol: string): Promise<void> {
  const trendDescriptor = activeDescriptors.find((item) => item.type === "TREND" && item.exchange === "bybit" && item.symbol === symbol);
  if (!trendDescriptor || processing.has(symbol) || status !== "RUNNING" || !registry.list().find((item) => item.symbol === symbol)?.enabled) return;
  const context = contexts.get(symbol);
  if (!context) return;
  processing.add(symbol);
  try {
    const signal = context.signals.evaluate(symbol);
    if (!signal) return;
    await journal.record("SIGNAL_GENERATED", { signal });
    const decision = await context.risk.approve(symbol, signal);
    await journal.record(decision.approved ? "RISK_APPROVED" : "RISK_REJECTED", { signal, decision });
    if (!decision.approved) {
      log.info({ reason: decision.reason }, "signal rejected");
      return;
    }
    const strategyId = trendDescriptor.id;
    const conflictDecision = coordinator.check("bybit", symbol, "TREND", signal.direction, decision.positionSizeUsdt, strategyId);
    if (!conflictDecision.approved) {
      await journal.record("RISK_REJECTED", { signal, decision: conflictDecision });
      return;
    }
    const portfolioDecision = await portfolio.approve("bybit", symbol, decision.positionSizeUsdt);
    if (!portfolioDecision.approved) {
      await journal.record("RISK_REJECTED", { signal, decision: portfolioDecision });
      return;
    }
    const tradeId = await orderManager.execute(symbol, signal, decision, "bybit", strategyId);
    coordinator.open("bybit", symbol, { strategyId, type: "TREND", direction: signal.direction, sizeUsdt: decision.positionSizeUsdt });
    await Promise.all([
      telegram.tradeOpened(symbol, signal, decision.positionSizeUsdt, decision.leverage),
      discord.tradeOpened(symbol, signal, decision.positionSizeUsdt, decision.leverage),
    ]);
    log.info({ tradeId }, "trade opened");
  } catch (error) {
    status = "ERROR";
    context.circuitBreaker.trip(String(error));
    await discord.alert(`Critical engine error: ${String(error).slice(0, 500)}`);
    log.error({ error }, "evaluation failed");
  } finally {
    processing.delete(symbol);
  }
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
  const first = contexts.values().next().value;
  if (first) await metrics.collect(status, first.adaptive.snapshot.regime, first.adaptive.snapshot.config);
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
  log.fatal({ error }, "startup failed");
  process.exit(1);
});
