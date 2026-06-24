import { describe, expect, it } from 'vitest';
import { RiskEngine } from './RiskEngine.js';

const signal = { direction: 'LONG' as const, score: 80, entryPrice: 100, stopLoss: 98, takeProfit: 105, confidence: 'MEDIUM' as const, indicators: {} };

describe('RiskEngine', () => {
  it('blocks missing orderbook', () => {
    const result = new RiskEngine().approve({ signal, realizedPnlToday: 0, currentDrawdownPct: 0, tradeStats: { count: 0, winRate: 0.5, avgWin: 1, avgLoss: 1, equity: 1000 }, hasOpenPosition: false, bybitHeartbeatOk: true, atr: 2, price: 100 });
    expect(result.approved).toBe(false);
  });

  it('approves clean paper trade risk', () => {
    const result = new RiskEngine().approve({ signal, realizedPnlToday: 0, currentDrawdownPct: 0, tradeStats: { count: 0, winRate: 0.5, avgWin: 1, avgLoss: 1, equity: 1000 }, orderbook: { bid: 99.99, ask: 100.01, ts: Date.now() }, hasOpenPosition: false, bybitHeartbeatOk: true, atr: 2, price: 100 });
    expect(result.approved).toBe(true);
    expect(result.positionSizeUsdt).toBeGreaterThan(0);
  });
});
