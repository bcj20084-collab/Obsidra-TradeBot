import { createHmac, randomUUID } from "node:crypto";
import { AppError, ErrorCode, moduleLogger } from "@obsidra/shared";
import { TokenBucket } from "../../data/TokenBucket.js";
import type { OHLCVCandle, OrderParams, OrderResult, Position } from "../IExchangeAdapter.js";

const log = moduleLogger("BinanceRestClient");

export class BinanceRestClient {
  private readonly baseUrl: string;
  private readonly limiter = new TokenBucket(40, 40);
  constructor(private readonly apiKey: string, private readonly secret: string, testnet: boolean, private readonly paper: boolean) {
    this.baseUrl = testnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
  }
  get isPaperTrading(): boolean { return this.paper; }
  async publicGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    await this.limiter.take();
    const response = await fetch(`${this.baseUrl}${path}?${new URLSearchParams(params)}`);
    if (!response.ok) throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, `Binance HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  async signed<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string>): Promise<T> {
    await this.limiter.take();
    const query = new URLSearchParams({ ...params, recvWindow: "5000", timestamp: String(Date.now()) }).toString();
    const signature = createHmac("sha256", this.secret).update(query).digest("hex");
    const response = await fetch(`${this.baseUrl}${path}?${query}&signature=${signature}`, { method, headers: { "X-MBX-APIKEY": this.apiKey } });
    const json = await response.json() as T & { code?: number; msg?: string };
    if (!response.ok) {
      const retryable = [-1003, -1007, -1021].includes(json.code ?? 0);
      log[retryable ? "warn" : "error"]({ path, code: json.code }, "Binance request failed");
      throw new AppError(retryable ? ErrorCode.EXCHANGE_TEMPORARY : ErrorCode.EXCHANGE_PERMANENT, json.msg ?? "Binance error", { code: json.code });
    }
    return json;
  }
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    if (this.paper) return {
      exchangeOrderId: `paper-binance-${randomUUID()}`,
      clientOrderId: params.clientOrderId,
      symbol: params.symbol,
      side: params.side,
      status: params.orderType === "Limit" ? "New" : "Filled",
      avgFillPrice: params.price ?? 0,
      filledQty: params.orderType === "Limit" ? 0 : params.qty,
      feeUsdt: 0,
      timestamp: Date.now(),
    };
    const entry = await this.signed<{ orderId: number; avgPrice?: string; executedQty?: string }>("POST", "/fapi/v1/order", {
      symbol: params.symbol, side: params.side === "Buy" ? "BUY" : "SELL", type: params.orderType.toUpperCase(),
      quantity: String(params.qty), newClientOrderId: params.clientOrderId,
      ...(params.price ? { price: String(params.price), timeInForce: "GTC" } : {}),
      ...(params.reduceOnly ? { reduceOnly: "true" } : {}),
    });
    const protective: string[] = [];
    try {
      for (const [type, stopPrice] of [["STOP_MARKET", params.stopLoss], ["TAKE_PROFIT_MARKET", params.takeProfit]] as const) {
        if (!stopPrice) continue;
        const order = await this.signed<{ orderId: number }>("POST", "/fapi/v1/order", {
          symbol: params.symbol, side: params.side === "Buy" ? "SELL" : "BUY", type, stopPrice: String(stopPrice), closePosition: "true",
        });
        protective.push(String(order.orderId));
      }
    } catch (error) {
      const reportedQty = Number(entry.executedQty ?? 0);
      const filledQty = reportedQty > 0 ? reportedQty : params.qty;
      const cleanup = await Promise.allSettled([
        this.cancelOrder(params.symbol, String(entry.orderId)),
        ...protective.map((id) => this.cancelOrder(params.symbol, id)),
        this.signed("POST", "/fapi/v1/order", {
          symbol: params.symbol,
          side: params.side === "Buy" ? "SELL" : "BUY",
          type: "MARKET",
          quantity: String(filledQty),
          reduceOnly: "true",
          newClientOrderId: `obs-emergency-${randomUUID()}`.slice(0, 36),
        }),
      ]);
      if (cleanup.some((result) => result.status === "rejected")) {
        log.fatal({ symbol: params.symbol, entryOrderId: entry.orderId }, "emergency close failed after protective-order failure");
      }
      throw error;
    }
    return { exchangeOrderId: String(entry.orderId), clientOrderId: params.clientOrderId, symbol: params.symbol, side: params.side, status: "New", avgFillPrice: Number(entry.avgPrice ?? 0), filledQty: Number(entry.executedQty ?? params.qty), feeUsdt: 0, timestamp: Date.now() };
  }
  async cancelOrder(symbol: string, orderId: string) { if (!this.paper) await this.signed("DELETE", "/fapi/v1/order", { symbol, orderId }); }
  async setLeverage(symbol: string, leverage: number) { if (!this.paper) await this.signed("POST", "/fapi/v1/leverage", { symbol, leverage: String(leverage) }); }
  async walletBalance() { if (this.paper) return 10_000; const rows = await this.signed<Array<{ asset: string; availableBalance: string }>>("GET", "/fapi/v2/balance", {}); return Number(rows.find((r) => r.asset === "USDT")?.availableBalance ?? 0); }
  async positions(symbol?: string): Promise<Position[]> {
    if (this.paper) return [];
    const rows = await this.signed<Array<Record<string, string>>>("GET", "/fapi/v2/positionRisk", symbol ? { symbol } : {});
    return rows.filter((r) => Number(r.positionAmt) !== 0).map((r) => ({ symbol: r.symbol!, side: Number(r.positionAmt) > 0 ? "Long" : "Short", size: Math.abs(Number(r.positionAmt)), entryPrice: Number(r.entryPrice), markPrice: Number(r.markPrice), unrealizedPnl: Number(r.unRealizedProfit), leverage: Number(r.leverage), liquidationPrice: Number(r.liquidationPrice) }));
  }
  async candles(symbol: string, interval: string, limit: number): Promise<OHLCVCandle[]> {
    const rows = await this.publicGet<unknown[][]>("/fapi/v1/klines", { symbol, interval: /^\d+$/.test(interval) ? `${interval}m` : interval, limit: String(limit) });
    return rows.map((r) => ({
      symbol, interval, openTime: Number(r[0]), open: Number(r[1]), high: Number(r[2]),
      low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]), closeTime: Number(r[6]),
      confirmed: true,
    }));
  }
}
