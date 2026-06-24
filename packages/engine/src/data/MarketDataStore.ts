import type { Candle } from "@obsidra/shared";

export interface Ticker {
  symbol: string;
  price: number;
  fundingRate: number;
  openInterest: number;
  timestamp: number;
}

export interface Orderbook {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

export class MarketDataStore {
  private readonly candles = new Map<string, Candle[]>();
  private ticker?: Ticker;
  private orderbook?: Orderbook;

  constructor(private readonly maxCandles = 500) {}

  addCandle(candle: Candle): void {
    const key = `${candle.symbol}:${candle.timeframe}`;
    const items = this.candles.get(key) ?? [];
    const existing = items.findIndex((item) => item.openTime === candle.openTime);
    if (existing >= 0) items[existing] = candle;
    else items.push(candle);
    items.sort((a, b) => a.openTime - b.openTime);
    this.candles.set(key, items.slice(-this.maxCandles));
  }

  getCandles(symbol: string, timeframe: string, limit = this.maxCandles): Candle[] {
    return [...(this.candles.get(`${symbol}:${timeframe}`) ?? [])].slice(-limit);
  }

  setTicker(ticker: Ticker): void {
    this.ticker = ticker;
  }

  getTicker(): Ticker | undefined {
    return this.ticker;
  }

  setOrderbook(orderbook: Orderbook): void {
    this.orderbook = orderbook;
  }

  getOrderbook(): Orderbook | undefined {
    return this.orderbook;
  }
}
