export type Timeframe = '1' | '15' | '60' | '240';
export interface Candle { start: number; open: number; high: number; low: number; close: number; volume: number; confirm: boolean; }
export interface OrderbookTop { bid: number; ask: number; ts: number; }
export interface Ticker { symbol: string; price: number; fundingRate: number; openInterest?: number; ts: number; }

export class MarketDataStore {
  private candles = new Map<Timeframe, Candle[]>();
  private orderbook?: OrderbookTop;
  private ticker?: Ticker;
  constructor(private readonly maxCandles = 500) {}

  upsertCandle(tf: Timeframe, candle: Candle) {
    const list = this.candles.get(tf) ?? [];
    const i = list.findIndex((x) => x.start === candle.start);
    if (i >= 0) list[i] = candle; else list.push(candle);
    list.sort((a, b) => a.start - b.start);
    this.candles.set(tf, list.slice(-this.maxCandles));
  }

  getCandles(tf: Timeframe, limit = this.maxCandles) { return [...(this.candles.get(tf) ?? [])].slice(-limit); }
  setOrderbook(top: OrderbookTop) { this.orderbook = top; }
  getOrderbook() { return this.orderbook; }
  setTicker(ticker: Ticker) { this.ticker = ticker; }
  getTicker() { return this.ticker; }
}
