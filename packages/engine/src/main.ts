import { getEnv, moduleLogger, prisma, tradingSymbols, type BotStatus } from "@obsidra/shared";
import { BybitRestClient } from "./data/BybitRestClient.js";
import { BybitWebSocket } from "./data/BybitWebSocket.js";
import { MarketDataStore } from "./data/MarketDataStore.js";
import { ExecutionJournal } from "./execution/ExecutionJournal.js";
import { OrderManager } from "./execution/OrderManager.js";
import { OrderStateMachine } from "./execution/OrderStateMachine.js";
import { ReconciliationService } from "./execution/ReconciliationService.js";
import { DiscordNotifier } from "./monitoring/DiscordNotifier.js";
import { startHealthServer } from "./monitoring/HealthCheck.js";
import { MetricsCollector } from "./monitoring/MetricsCollector.js";
import { TelegramNotifier } from "./monitoring/TelegramNotifier.js";
import { PreFlightCheck } from "./risk/PreFlightCheck.js";
import { RiskEngine } from "./risk/RiskEngine.js";
import { AdaptiveParams } from "./signals/AdaptiveParams.js";
import { CircuitBreaker } from "./signals/CircuitBreaker.js";
import { MLScorer } from "./signals/MLScorer.js";
import { SignalEngine } from "./signals/SignalEngine.js";
import { MLTrainer } from "./signals/MLTrainer.js";
import { PortfolioManager } from "./symbols/PortfolioManager.js";
import { SymbolRegistry } from "./symbols/SymbolRegistry.js";

const env = getEnv();
const log = moduleLogger("engine");
const store = new MarketDataStore();
const symbols = tradingSymbols(env);
const registry = new SymbolRegistry(symbols);
const client = new BybitRestClient(env.BYBIT_API_KEY_NEW || env.BYBIT_API_KEY, env.BYBIT_API_SECRET_NEW || env.BYBIT_API_SECRET, env.BYBIT_TESTNET, env.PAPER_TRADING, env.MASTER_SECRET);
const websocket = new BybitWebSocket(store, symbols, env.BYBIT_TESTNET);
const journal = new ExecutionJournal();
const stateMachine = new OrderStateMachine(journal);
const orderManager = new OrderManager(client, stateMachine, journal);
const preflight = new PreFlightCheck(store, client, env.SPREAD_MAX_PCT, env.PAPER_TRADING);
const reconciliation = new ReconciliationService(client, journal);
const metrics = new MetricsCollector();
const trainer = new MLTrainer();
const portfolio = new PortfolioManager(env.MAX_OPEN_POSITIONS, env.PORTFOLIO_MAX_USDT);
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
  log.info({ paperTrading: env.PAPER_TRADING, symbols }, "engine started");
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
  if (processing.has(symbol) || status !== "RUNNING" || !registry.list().find((item) => item.symbol === symbol)?.enabled) return;
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
    const portfolioDecision = await portfolio.approve(symbol, signal.direction, decision.positionSizeUsdt);
    if (!portfolioDecision.approved) {
      await journal.record("RISK_REJECTED", { signal, decision: portfolioDecision });
      return;
    }
    const tradeId = await orderManager.execute(symbol, signal, decision);
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
