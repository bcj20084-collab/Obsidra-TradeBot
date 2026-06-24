import { describe, expect, it } from 'vitest';
import { MarketDataStore } from './MarketDataStore.js';

describe('MarketDataStore', () => {
  it('keeps candles sorted and capped', () => {
    const store = new MarketDataStore(2);
    store.upsertCandle('1', { start: 2, open: 2, high: 2, low: 2, close: 2, volume: 1, confirm: true });
    store.upsertCandle('1', { start: 1, open: 1, high: 1, low: 1, close: 1, volume: 1, confirm: true });
    store.upsertCandle('1', { start: 3, open: 3, high: 3, low: 3, close: 3, volume: 1, confirm: true });
    const candles = store.getCandles('1');
    expect(candles.map((c) => c.start)).toEqual([2, 3]);
  });

  it('stores orderbook and ticker snapshots', () => {
    const store = new MarketDataStore();
    store.setOrderbook({ bid: 99, ask: 100, ts: 1 });
    store.setTicker({ symbol: 'BTCUSDT', price: 100, fundingRate: 0, ts: 1 });
    expect(store.getOrderbook()?.bid).toBe(99);
    expect(store.getTicker()?.symbol).toBe('BTCUSDT');
  });
});
