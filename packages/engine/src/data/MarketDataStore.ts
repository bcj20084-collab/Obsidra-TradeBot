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
  private readonly tickers = new Map<string, Ticker>();
  private readonly orderbooks = new Map<string, Orderbook>();

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
    if (!Number.isFinite(ticker.price) || ticker.price <= 0) return;
    this.tickers.set(ticker.symbol, ticker);
  }

  getTicker(symbol?: string): Ticker | undefined {
    return symbol ? this.tickers.get(symbol) : this.tickers.values().next().value;
  }

  setOrderbook(orderbook: Orderbook): void {
    this.orderbooks.set(orderbook.symbol, orderbook);
  }

  getOrderbook(symbol?: string): Orderbook | undefined {
    return symbol ? this.orderbooks.get(symbol) : this.orderbooks.values().next().value;
  }
}
