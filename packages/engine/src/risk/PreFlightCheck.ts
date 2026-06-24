import type { OrderbookTop } from '../data/MarketDataStore.js';

export interface PreFlightInput { orderbook?: OrderbookTop; hasOpenPosition: boolean; bybitHeartbeatOk: boolean; spreadMaxPct: number; }

export class PreFlightCheck {
  run(input: PreFlightInput) {
    if (!input.orderbook) return { ok: false, reason: 'Missing orderbook' };
    const mid = (input.orderbook.bid + input.orderbook.ask) / 2;
    const spreadPct = ((input.orderbook.ask - input.orderbook.bid) / mid) * 100;
    if (spreadPct > input.spreadMaxPct) return { ok: false, reason: `Spread too high: ${spreadPct.toFixed(4)}%` };
    if (input.hasOpenPosition) return { ok: false, reason: 'Position already open for symbol' };
    if (!input.bybitHeartbeatOk) return { ok: false, reason: 'Bybit heartbeat stale' };
    return { ok: true as const };
  }
}
