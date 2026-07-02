import { createHmac, randomUUID } from "node:crypto";
import { AppError, ErrorCode, moduleLogger } from "@obsidra/shared";
import { TokenBucket } from "../../data/TokenBucket.js";
import { calculatePaperMarketFill } from "../../execution/PaperFillModel.js";
import type { OHLCVCandle, OrderParams, OrderResult, Position } from "../IExchangeAdapter.js";

const log = moduleLogger("BinanceRestClient");

interface BinanceOrderResponse {
  orderId: number;
  avgPrice?: string;
  executedQty?: string;
  status?: string;
}

interface BinanceUserTrade {
  commission: string;
  commissionAsset: string;
}

function toBinanceInterval(interval: string): string {
  if (interval === "60") return "1h";
  if (interval === "240") return "4h";
  return /^\d+$/.test(interval) ? `${interval}m` : interval;
}

function mapBinanceStatus(status: string | undefined): OrderResult["status"] {
  if (status === "FILLED") return "Filled";
  if (status === "CANCELED" || status === "EXPIRED") return "Cancelled";
  if (status === "REJECTED") return "Rejected";
  return "New";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

export class BinanceRestClient {
  private readonly baseUrl: string;
  private readonly limiter = new TokenBucket(40, 40);
  constructor(
    private readonly apiKey: string,
    private readonly secret: string,
    testnet: boolean,
    private readonly paper: boolean,
    private readonly paperFeeRate = 0.00055,
    private readonly paperSlippageBps = 2,
  ) {
    this.baseUrl = testnet ? "https://demo-fapi.binance.com" : "https://fapi.binance.com";
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
    if (this.paper) {
      if (params.orderType === "Market") {
        const book = await this.publicGet<{ bidPrice: string; askPrice: string }>("/fapi/v1/ticker/bookTicker", { symbol: params.symbol });
        const fill = calculatePaperMarketFill({
          side: params.side,
          qty: params.qty,
          bid: Number(book.bidPrice),
          ask: Number(book.askPrice),
          feeRate: this.paperFeeRate,
          slippageBps: this.paperSlippageBps,
        });
        return {
          exchangeOrderId: `paper-binance-${randomUUID()}`,
          clientOrderId: params.clientOrderId,
          symbol: params.symbol,
          side: params.side,
          status: "Filled",
          avgFillPrice: fill.fillPrice,
          filledQty: fill.filledQty,
          feeUsdt: fill.feeUsdt,
          timestamp: Date.now(),
        };
      }
      return {
        exchangeOrderId: `paper-binance-${randomUUID()}`,
        clientOrderId: params.clientOrderId,
        symbol: params.symbol,
        side: params.side,
        status: "New",
        avgFillPrice: params.price ?? 0,
        filledQty: 0,
        feeUsdt: 0,
        timestamp: Date.now(),
      };
    }
    const entry = await this.signed<BinanceOrderResponse>("POST", "/fapi/v1/order", {
      symbol: params.symbol, side: params.side === "Buy" ? "BUY" : "SELL", type: params.orderType.toUpperCase(),
      quantity: String(params.qty), newClientOrderId: params.clientOrderId,
      ...(params.price ? { price: String(params.price), timeInForce: "GTC" } : {}),
      ...(params.reduceOnly ? { reduceOnly: "true" } : {}),
    });
    const finalEntry = params.orderType === "Market" ? await this.resolveMarketFill(params.symbol, entry) : entry;
    const filledQty = Number(finalEntry.executedQty ?? entry.executedQty ?? (params.orderType === "Market" ? params.qty : 0));
    const feeUsdt = filledQty > 0 ? await this.getOrderFeeUsdt(params.symbol, String(entry.orderId)) : 0;
    const protective: string[] = [];
    const protectiveStartAt = Date.now();
    try {
      for (const [type, stopPrice] of [["STOP_MARKET", params.stopLoss], ["TAKE_PROFIT_MARKET", params.takeProfit]] as const) {
        if (!stopPrice) continue;
        const order = await this.signed<{ orderId: number }>("POST", "/fapi/v1/order", {
          symbol: params.symbol, side: params.side === "Buy" ? "SELL" : "BUY", type, stopPrice: String(stopPrice), closePosition: "true",
        });
        protective.push(String(order.orderId));
      }
      if (protective.length > 0) {
        log.info({
          symbol: params.symbol,
          entryOrderId: entry.orderId,
          protectiveOrderIds: protective,
          protectiveGapMs: Date.now() - protectiveStartAt,
        }, "Binance protective-order gap measured");
      }
    } catch (error) {
      const reportedQty = Number(finalEntry.executedQty ?? entry.executedQty ?? 0);
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
    return {
      exchangeOrderId: String(entry.orderId),
      clientOrderId: params.clientOrderId,
      symbol: params.symbol,
      side: params.side,
      status: mapBinanceStatus(finalEntry.status),
      avgFillPrice: Number(finalEntry.avgPrice ?? 0),
      filledQty,
      feeUsdt,
      timestamp: Date.now(),
    };
  }
  private async resolveMarketFill(symbol: string, entry: BinanceOrderResponse): Promise<BinanceOrderResponse> {
    if (Number(entry.avgPrice ?? 0) > 0 && entry.status) return entry;
    for (let attempt = 0; attempt < 3; attempt++) {
      await delay(500);
      try {
        const order = await this.signed<BinanceOrderResponse>("GET", "/fapi/v1/order", { symbol, orderId: String(entry.orderId) });
        if (Number(order.avgPrice ?? 0) > 0 || order.status === "FILLED") return { ...entry, ...order };
      } catch (error) {
        log.warn({ attempt, error, orderId: entry.orderId, symbol }, "Binance fill-price poll failed");
      }
    }
    log.warn({ orderId: entry.orderId, symbol }, "Binance avgFillPrice unavailable, using signal price fallback downstream");
    return entry;
  }
  private async getOrderFeeUsdt(symbol: string, orderId: string): Promise<number> {
    const fills = await this.signed<BinanceUserTrade[]>("GET", "/fapi/v1/userTrades", { symbol, orderId }).catch((error) => {
      log.warn({ error, symbol, orderId }, "Binance fee lookup failed");
      return [];
    });
    let feeUsdt = 0;
    for (const fill of fills) {
      if (fill.commissionAsset !== "USDT") {
        throw new AppError(
          ErrorCode.EXCHANGE_PERMANENT,
          `Unsupported Binance commission asset ${fill.commissionAsset}; disable non-USDT fee discounts or add conversion before live trading`,
        );
      }
      feeUsdt += Number(fill.commission);
    }
    return feeUsdt;
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
    const rows = await this.publicGet<unknown[][]>("/fapi/v1/klines", { symbol, interval: toBinanceInterval(interval), limit: String(limit) });
    return rows.map((r) => ({
      symbol, interval, openTime: Number(r[0]), open: Number(r[1]), high: Number(r[2]),
      low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]), closeTime: Number(r[6]),
      confirmed: true,
    }));
  }
}
