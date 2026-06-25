import type { IExchangeAdapter, OHLCVCandle, OrderParams, OrderResult, Position } from "../IExchangeAdapter.js";
import type { BybitRestClient } from "../../data/BybitRestClient.js";
import type { BybitWebSocket } from "../../data/BybitWebSocket.js";
import type { MarketDataStore } from "../../data/MarketDataStore.js";

export class BybitAdapter implements IExchangeAdapter {
  readonly exchangeId = "bybit" as const;
  constructor(private readonly rest: BybitRestClient, private readonly ws: BybitWebSocket, private readonly store: MarketDataStore) {}
  subscribeCandles(symbol: string, intervals: string[], callback: (candle: OHLCVCandle) => void): void {
    this.ws.on("kline", (candle) => {
      if (candle.symbol === symbol && intervals.includes(candle.timeframe)) {
        callback({ ...candle, interval: candle.timeframe });
      }
    });
  }
  subscribeTicker(symbol: string, callback: (price: number, fundingRate: number) => void): void {
    this.ws.on("tick", (ticker) => { if (ticker.symbol === symbol) callback(ticker.price, ticker.fundingRate); });
  }
  async getBestBidAsk(symbol: string) {
    const cached = this.store.getOrderbook(symbol);
    if (cached) return { bid: cached.bid, ask: cached.ask };
    const response = await this.rest.publicGet<{ result: { list: Array<{ bid1Price: string; ask1Price: string }> } }>("/v5/market/tickers", { category: "linear", symbol });
    const ticker = response.result.list[0];
    if (!ticker) throw new Error(`Bybit ticker unavailable for ${symbol}`);
    return { bid: Number(ticker.bid1Price), ask: Number(ticker.ask1Price) };
  }
  async getHistoricalCandles(symbol: string, interval: string, limit: number) {
    return (await this.rest.getKlines(symbol, interval, limit)).map((candle) => ({ ...candle, interval: candle.timeframe }));
  }
  getWalletBalance() { return this.rest.getWalletEquity(); }
  async getOpenPositions(symbol?: string): Promise<Position[]> {
    return (await this.rest.getOpenPositions(symbol)).map((p) => ({
      symbol: String(p.symbol), side: p.side === "Buy" ? "Long" : "Short",
      size: Number(p.size), entryPrice: Number(p.avgPrice), markPrice: Number(p.markPrice),
      unrealizedPnl: Number(p.unrealisedPnl), leverage: Number(p.leverage), liquidationPrice: Number(p.liqPrice),
    }));
  }
  getFundingRate(symbol: string) { return this.rest.getFundingRate(symbol); }
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    const result = await this.rest.placeOrder({
      symbol: params.symbol, side: params.side, qty: String(params.qty),
      stopLoss: String(params.stopLoss ?? ""), takeProfit: String(params.takeProfit ?? ""),
      clientOrderId: params.clientOrderId,
    });
    return { exchangeOrderId: result.orderId, clientOrderId: params.clientOrderId, symbol: params.symbol, side: params.side, status: "New", avgFillPrice: 0, filledQty: params.qty, feeUsdt: 0, timestamp: Date.now() };
  }
  cancelOrder(symbol: string, orderId: string) { return this.rest.cancelOrder(symbol, orderId); }
  setLeverage(symbol: string, leverage: number) { return this.rest.setLeverage(symbol, leverage); }
  async ping() { const start = Date.now(); await this.getServerTime(); return Date.now() - start; }
  async getServerTime() {
    const response = await this.rest.publicGet<{ time: number }>("/v5/market/time", {});
    return Number(response.time);
  }
}
