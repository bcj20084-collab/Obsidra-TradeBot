import { getEnv, moduleLogger, prisma, type BotStatus } from "@obsidra/shared";
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

const env = getEnv();
const log = moduleLogger("engine");
const store = new MarketDataStore();
const client = new BybitRestClient(env.BYBIT_API_KEY, env.BYBIT_API_SECRET, env.BYBIT_TESTNET, env.PAPER_TRADING);
const websocket = new BybitWebSocket(store, env.TRADING_SYMBOL, env.BYBIT_TESTNET);
const journal = new ExecutionJournal();
const stateMachine = new OrderStateMachine(journal);
const orderManager = new OrderManager(client, stateMachine, journal);
const adaptive = new AdaptiveParams();
const circuitBreaker = new CircuitBreaker();
const ml = new MLScorer();
const signals = new SignalEngine(store, ml, adaptive, circuitBreaker);
const preflight = new PreFlightCheck(store, client, env.SPREAD_MAX_PCT, env.PAPER_TRADING);
const risk = new RiskEngine(env.DAILY_LOSS_LIMIT_USDT, env.MAX_DRAWDOWN_PCT, env.TRADING_POSITION_MAX_USDT, preflight, client, adaptive);
const reconciliation = new ReconciliationService(client, journal);
const metrics = new MetricsCollector();
const telegram = new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
const discord = new DiscordNotifier(env.DISCORD_WEBHOOK_TRADES, env.DISCORD_WEBHOOK_ALERTS, env.DISCORD_WEBHOOK_DAILY);
let status: BotStatus = "RUNNING";
let processing = false;

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  await prisma.botState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", status },
    update: { status, reason: env.PAPER_TRADING ? "Paper trading startup" : "Live startup" },
  });
  await prisma.botEvent.create({ data: { type: "STARTED", message: `Engine started (${env.PAPER_TRADING ? "paper" : "live"})` } });
  await ml.initialize();
  await reconciliation.reconcile(env.TRADING_SYMBOL);
  websocket.connect();
  startHealthServer(env.PORT + 1, () => metrics.latest);
  setInterval(refreshControl, 2_000).unref();
  setInterval(refreshMetrics, 300_000).unref();
  setInterval(() => void ml.retrain(), 3_600_000).unref();
  websocket.on("kline", (candle) => {
    if (candle.timeframe === "15" && candle.confirmed) void evaluate();
  });
  log.info({ paperTrading: env.PAPER_TRADING, symbol: env.TRADING_SYMBOL }, "engine started");
}

async function evaluate(): Promise<void> {
  if (processing || status !== "RUNNING") return;
  processing = true;
  try {
    const signal = signals.evaluate(env.TRADING_SYMBOL);
    if (!signal) return;
    await journal.record("SIGNAL_GENERATED", { signal });
    const decision = await risk.approve(env.TRADING_SYMBOL, signal);
    await journal.record(decision.approved ? "RISK_APPROVED" : "RISK_REJECTED", { signal, decision });
    if (!decision.approved) {
      log.info({ reason: decision.reason }, "signal rejected");
      return;
    }
    const tradeId = await orderManager.execute(env.TRADING_SYMBOL, signal, decision);
    await Promise.all([
      telegram.tradeOpened(env.TRADING_SYMBOL, signal, decision.positionSizeUsdt, decision.leverage),
      discord.tradeOpened(env.TRADING_SYMBOL, signal, decision.positionSizeUsdt, decision.leverage),
    ]);
    log.info({ tradeId }, "trade opened");
  } catch (error) {
    status = "ERROR";
    circuitBreaker.trip(String(error));
    await discord.alert(`Critical engine error: ${String(error).slice(0, 500)}`);
    log.error({ error }, "evaluation failed");
  } finally {
    processing = false;
  }
}

async function refreshControl(): Promise<void> {
  const state = await prisma.botState.findUnique({ where: { id: "singleton" } });
  if (state?.status && state.status !== status) {
    status = state.status as BotStatus;
    if (status === "STOPPED") {
      circuitBreaker.trip(state.reason ?? "Kill switch");
      await client.cancelAll(env.TRADING_SYMBOL);
    } else if (status === "RUNNING") {
      circuitBreaker.reset();
    }
  }
}

async function refreshMetrics(): Promise<void> {
  await metrics.collect(status, adaptive.snapshot.regime, adaptive.snapshot.config);
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
  while (processing && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
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
