import { env } from './config/env.js';
import { MarketDataStore } from './data/MarketDataStore.js';
import { BybitWebSocket } from './data/BybitWebSocket.js';
import { SignalEngine } from './signals/SignalEngine.js';
import { RiskEngine } from './risk/RiskEngine.js';
import { OrderManager } from './execution/OrderManager.js';
import { ReconciliationService } from './execution/ReconciliationService.js';
import { TradeRepository } from './db/repositories/TradeRepository.js';
import { LogRepository } from './db/repositories/LogRepository.js';
import { closeDatabase } from './db/client.js';
import { NotifierHub } from './monitoring/NotifierHub.js';
import { logger, logError } from './utils/logger.js';

let stopping = false;
const store = new MarketDataStore();
const ws = new BybitWebSocket(store);
const signals = new SignalEngine(store);
const risk = new RiskEngine();
const orders = new OrderManager();
const reconcile = new ReconciliationService();
const trades = new TradeRepository();
const events = new LogRepository();
const notifier = new NotifierHub();

async function tick() {
  if (stopping) return;
  const signal = signals.evaluate();
  if (!signal) return;
  const orderbook = store.getOrderbook();
  const open = await trades.openForSymbol(env.TRADING_SYMBOL);
  const dailyPnl = await trades.dailyPnl();
  const tradeStats = await trades.stats(50, 1000);
  const decision = risk.approve({ signal, realizedPnlToday: dailyPnl, currentDrawdownPct: 0, tradeStats, orderbook, hasOpenPosition: Boolean(open), bybitHeartbeatOk: true, atr: Math.abs(signal.entryPrice - signal.stopLoss), price: signal.entryPrice });
  if (!decision.approved) {
    logger.info({ module: 'main', reason: decision.reason }, 'signal rejected');
    await events.create('RISK_BLOCKED', decision.reason ?? 'Risk blocked signal', { signal });
    await notifier.riskBlocked(decision.reason ?? 'Risk blocked signal');
    return;
  }
  await orders.place(signal, decision);
  await notifier.tradeOpened(signal, decision);
}

async function start() {
  logger.info({ module: 'main', paper: env.PAPER_TRADING, testnet: env.BYBIT_TESTNET }, 'starting Obsidra engine');
  await events.create('STARTED', 'Obsidra engine started', { paper: env.PAPER_TRADING, testnet: env.BYBIT_TESTNET });
  await reconcile.run();
  ws.connect();
  setInterval(() => void tick().catch((error) => logError('tick', error)), 15_000);
}

async function shutdown(signal: string) {
  stopping = true;
  logger.warn({ module: 'main', signal }, 'graceful shutdown started');
  ws.close();
  await events.create('SERVICE_EXIT', 'Obsidra engine exit', { signal }).catch((error) => logError('shutdown.event', error));
  await closeDatabase().catch((error) => logError('shutdown.db', error));
  setTimeout(() => process.exit(0), 30_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
void start().catch((error) => { logError('main', error); process.exit(1); });
