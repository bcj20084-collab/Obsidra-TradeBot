import { describe, expect, it } from 'vitest';
import { normalizeKline, normalizeOrderbook, normalizeTicker } from './DataNormalizer.js';

describe('DataNormalizer', () => {
  it('normalizes kline messages', () => {
    const result = normalizeKline('1', { data: [{ start: '1', open: '10', high: '12', low: '9', close: '11', volume: '100', confirm: true }] });
    expect(result?.candle.close).toBe(11);
  });

  it('normalizes orderbook top', () => {
    const result = normalizeOrderbook({ ts: 1, data: { b: [['99', '1']], a: [['100', '1']] } });
    expect(result?.bid).toBe(99);
    expect(result?.ask).toBe(100);
  });

  it('normalizes ticker data', () => {
    const result = normalizeTicker({ ts: 1, data: { symbol: 'BTCUSDT', lastPrice: '100', fundingRate: '0.01', openInterest: '10' } });
    expect(result?.price).toBe(100);
    expect(result?.fundingRate).toBe(0.01);
  });
});
