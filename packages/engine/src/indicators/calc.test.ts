import { describe, expect, it } from 'vitest';
import { adx, atr, bollinger, ema, macd, rsi } from './calc.js';

const candles = Array.from({ length: 60 }, (_, i) => ({ start: i, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 10, confirm: true }));

describe('indicators', () => {
  it('calculates ema', () => { expect(ema([1, 2, 3], 2)).toHaveLength(3); });
  it('calculates rsi', () => { expect(rsi(candles.map((c) => c.close))).toBeGreaterThan(50); });
  it('calculates macd', () => { expect(macd(candles.map((c) => c.close))).toHaveProperty('histogram'); });
  it('calculates bollinger', () => { expect(bollinger(candles.map((c) => c.close)).upper).toBeGreaterThan(0); });
  it('calculates atr and adx', () => { expect(atr(candles)).toBeGreaterThan(0); expect(adx(candles)).toBeGreaterThanOrEqual(0); });
});
