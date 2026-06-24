import { describe, expect, it } from 'vitest';
import { PaperSimulator } from './PaperSimulator.js';

const signal = { direction: 'LONG' as const, score: 80, entryPrice: 100, stopLoss: 98, takeProfit: 105, confidence: 'MEDIUM' as const, indicators: {} };
const risk = { approved: true, positionSizeUsdt: 1000, leverage: 2, stopLossPrice: 98, takeProfitPrice: 105, trailingStopPct: 1.5 };

describe('PaperSimulator', () => {
  it('creates a deterministic fill at entry price', () => {
    const fill = new PaperSimulator().simulate(signal, risk);
    expect(fill.fillPrice).toBe(100);
    expect(fill.feeUsdt).toBeCloseTo(0.6);
    expect(fill.filledAt).toBeInstanceOf(Date);
  });
});
