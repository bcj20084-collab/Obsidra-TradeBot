import type { IExchangeAdapter, OHLCVCandle, OrderParams } from "../IExchangeAdapter.js";
import type { BinanceRestClient } from "./BinanceRestClient.js";
import type { BinanceWebSocket } from "./BinanceWebSocket.js";

export class BinanceAdapter implements IExchangeAdapter {
  readonly exchangeId = "binance" as const;
  constructor(private readonly rest: BinanceRestClient, private readonly ws: BinanceWebSocket) {}
  subscribeCandles(symbol: string, intervals: string[], callback: (c: OHLCVCandle) => void): void {
    this.ws.on("candle", (incoming, candle) => { if (incoming === symbol) callback(candle); });
    this.ws.subscribe([symbol], intervals);
  }
  subscribeTicker(symbol: string, callback: (price: number, fundingRate: number) => void): void {
    this.ws.on("ticker", (incoming, price, funding) => { if (incoming === symbol) callback(price, funding); });
  }
  async getBestBidAsk(symbol: string) { const row = await this.rest.publicGet<{ bidPrice: string; askPrice: string }>("/fapi/v1/ticker/bookTicker", { symbol }); return { bid: Number(row.bidPrice), ask: Number(row.askPrice) }; }
  getHistoricalCandles(symbol: string, interval: string, limit: number) { return this.rest.candles(symbol, interval, limit); }
  getWalletBalance() { return this.rest.walletBalance(); }
  getOpenPositions(symbol?: string) { return this.rest.positions(symbol); }
  async getFundingRate(symbol: string) { const rows = await this.rest.publicGet<Array<{ fundingRate: string }>>("/fapi/v1/fundingRate", { symbol, limit: "1" }); return Number(rows[0]?.fundingRate ?? 0); }
  placeOrder(params: OrderParams) { return this.rest.placeOrder(params); }
  cancelOrder(symbol: string, orderId: string) { return this.rest.cancelOrder(symbol, orderId); }
  setLeverage(symbol: string, leverage: number) { return this.rest.setLeverage(symbol, leverage); }
  async ping() { const start = Date.now(); await this.getServerTime(); return Date.now() - start; }
  async getServerTime() { return (await this.rest.publicGet<{ serverTime: number }>("/fapi/v1/time")).serverTime; }
}
