import { env } from './config/env.js';
import { MarketDataStore } from './data/MarketDataStore.js';
import { BybitWebSocket } from './data/BybitWebSocket.js';
import { SignalEngine } from './signals/SignalEngine.js';
import { RiskEngine } from './risk/RiskEngine.js';
import { OrderManager } from './execution/OrderManager.js';
import { ReconciliationService } from './execution/ReconciliationService.js';
import { logger, logError } from './utils/logger.js';

let stopping = false;
const store = new MarketDataStore();
const ws = new BybitWebSocket(store);
const signals = new SignalEngine(store);
const risk = new RiskEngine();
const orders = new OrderManager();
const reconcile = new ReconciliationService();

async function tick() {
  if (stopping) return;
  const signal = signals.evaluate();
  if (!signal) return;
  const orderbook = store.getOrderbook();
  const decision = risk.approve({ signal, realizedPnlToday: 0, currentDrawdownPct: 0, tradeStats: { count: 0, winRate: 0.5, avgWin: 1, avgLoss: 1, equity: 1000 }, orderbook, hasOpenPosition: false, bybitHeartbeatOk: true, atr: Math.abs(signal.entryPrice - signal.stopLoss), price: signal.entryPrice });
  if (!decision.approved) return logger.info({ module: 'main', reason: decision.reason }, 'signal rejected');
  await orders.place(signal, decision);
}

async function start() {
  logger.info({ module: 'main', paper: env.PAPER_TRADING, testnet: env.BYBIT_TESTNET }, 'starting Obsidra engine');
  await reconcile.run();
  ws.connect();
  setInterval(() => void tick().catch((error) => logError('tick', error)), 15_000);
}

async function shutdown(signal: string) {
  stopping = true;
  logger.warn({ module: 'main', signal }, 'graceful shutdown started');
  ws.close();
  setTimeout(() => process.exit(0), 30_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
void start().catch((error) => { logError('main', error); process.exit(1); });
