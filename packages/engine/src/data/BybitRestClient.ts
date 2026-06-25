import { createHmac, randomUUID } from "node:crypto";
import { AppError, ErrorCode, errorMessage, moduleLogger } from "@obsidra/shared";
import { TokenBucket } from "./TokenBucket.js";
import { ApiKeyManager } from "../security/ApiKeyManager.js";

const log = moduleLogger("BybitRestClient");

export interface PlaceOrderRequest {
  symbol: string;
  side: "Buy" | "Sell";
  qty: string;
  stopLoss: string;
  takeProfit: string;
  clientOrderId?: string;
}

const RETRYABLE_CODES = new Set([10006, 10016]);
const FATAL_CODES = new Set([10003, 10004, 110007, 110014, 110025]);
const WARN_CODES = new Set([110017]);

export class BybitRestClient {
  private readonly privateLimiter = new TokenBucket(10, 10);
  private readonly publicLimiter = new TokenBucket(50, 50);
  private lastHeartbeat = 0;
  private readonly baseUrl: string;
  private readonly keys: ApiKeyManager;

  constructor(
    apiKey: string,
    apiSecret: string,
    testnet: boolean,
    private readonly paperTrading: boolean,
    masterSecret = process.env.MASTER_SECRET ?? "development-only-master-secret-32",
  ) {
    this.baseUrl = testnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
    this.keys = new ApiKeyManager(apiKey, apiSecret, masterSecret);
  }

  getLastHeartbeat(): number {
    return this.lastHeartbeat;
  }

  async getOpenPositions(symbol?: string): Promise<Array<Record<string, unknown>>> {
    if (this.paperTrading) return [];
    const result = await this.privateRequest<{ list: Array<Record<string, unknown>> }>(
      "GET",
      "/v5/position/list",
      { category: "linear", ...(symbol ? { symbol } : {}), settleCoin: "USDT" },
    );
    return result.list;
  }

  async getWalletEquity(): Promise<number> {
    if (this.paperTrading) return 10_000;
    const result = await this.privateRequest<{
      list: Array<{ totalEquity?: string }>;
    }>("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" });
    return Number(result.list[0]?.totalEquity ?? 0);
  }

  async placeOrder(request: PlaceOrderRequest): Promise<{ orderId: string; paper: boolean }> {
    if (this.paperTrading) {
      return { orderId: `paper-${randomUUID()}`, paper: true };
    }
    const result = await this.privateRequest<{ orderId: string }>("POST", "/v5/order/create", {
      category: "linear",
      symbol: request.symbol,
      side: request.side,
      orderType: "Market",
      qty: request.qty,
      stopLoss: request.stopLoss,
      takeProfit: request.takeProfit,
      orderLinkId: request.clientOrderId,
      positionIdx: 0,
    });
    return { orderId: result.orderId, paper: false };
  }

  async cancelAll(symbol: string): Promise<void> {
    if (this.paperTrading) return;
    await this.privateRequest("POST", "/v5/order/cancel-all", { category: "linear", symbol });
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    if (this.paperTrading) return;
    await this.privateRequest("POST", "/v5/order/cancel", { category: "linear", symbol, orderId });
  }

  async getOpenOrders(symbol?: string): Promise<Array<Record<string, unknown>>> {
    if (this.paperTrading) return [];
    const result = await this.privateRequest<{ list: Array<Record<string, unknown>> }>(
      "GET",
      "/v5/order/realtime",
      { category: "linear", ...(symbol ? { symbol } : {}), settleCoin: "USDT" },
    );
    return result.list;
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    if (this.paperTrading) return;
    await this.privateRequest("POST", "/v5/position/set-leverage", {
      category: "linear",
      symbol,
      buyLeverage: String(leverage),
      sellLeverage: String(leverage),
    });
  }

  async getKlines(symbol: string, interval: string, limit = 1000, start?: number, end?: number) {
    const response = await this.publicGet<{ result: { list: string[][] } }>("/v5/market/kline", {
      category: "linear",
      symbol,
      interval,
      limit: String(Math.min(1000, limit)),
      ...(start ? { start: String(start) } : {}),
      ...(end ? { end: String(end) } : {}),
    });
    return response.result.list.map((row) => ({
      symbol,
      timeframe: interval,
      openTime: Number(row[0]),
      closeTime: Number(row[0]) + 1,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      confirmed: true,
      turnover: Number(row[6] ?? 0),
    })).sort((a, b) => a.openTime - b.openTime);
  }

  async getFundingRate(symbol: string): Promise<number> {
    const response = await this.publicGet<{ result: { list: Array<{ fundingRate: string }> } }>(
      "/v5/market/funding/history",
      { category: "linear", symbol, limit: "1" },
    );
    return Number(response.result.list[0]?.fundingRate ?? 0);
  }

  async publicGet<T>(path: string, params: Record<string, string>): Promise<T> {
    await this.publicLimiter.take();
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseUrl}${path}?${query}`);
    this.lastHeartbeat = Date.now();
    if (!response.ok) throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, `Bybit HTTP ${response.status}`);
    const json = (await response.json()) as T & { retCode?: number; retMsg?: string };
    if (typeof json.retCode === "number" && json.retCode !== 0) {
      throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, json.retMsg ?? `Bybit error ${json.retCode}`, { retCode: json.retCode });
    }
    return json;
  }

  private async privateRequest<T = unknown>(
    method: "GET" | "POST",
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    await this.privateLimiter.take();
    const timestamp = Date.now().toString();
    const receiveWindow = "5000";
    const body = method === "POST" ? JSON.stringify(payload) : new URLSearchParams(payload as Record<string, string>).toString();
    const credentials = this.keys.withCredentials((apiKey, apiSecret) => ({
      apiKey,
      signature: createHmac("sha256", apiSecret)
        .update(`${timestamp}${apiKey}${receiveWindow}${body}`)
        .digest("hex"),
    }));
    const url = method === "GET" ? `${this.baseUrl}${path}?${body}` : `${this.baseUrl}${path}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": credentials.apiKey,
            "X-BAPI-SIGN": credentials.signature,
            "X-BAPI-TIMESTAMP": timestamp,
            "X-BAPI-RECV-WINDOW": receiveWindow,
          },
          ...(method === "POST" ? { body } : {}),
        });
        this.lastHeartbeat = Date.now();
        const json = (await response.json()) as {
          retCode: number;
          retMsg: string;
          result: T;
        };
        if (response.status === 429 || [500, 502, 503, 504].includes(response.status) || RETRYABLE_CODES.has(json.retCode)) {
          throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, json.retMsg);
        }
        if ([401, 403].includes(response.status) || FATAL_CODES.has(json.retCode)) {
          throw new AppError(ErrorCode.EXCHANGE_PERMANENT, json.retMsg, { retCode: json.retCode });
        }
        if (WARN_CODES.has(json.retCode) || (!response.ok || json.retCode !== 0)) {
          log.warn({ method, path, durationMs: Date.now() - Number(timestamp), retCode: json.retCode }, "Bybit action skipped");
          throw new AppError(ErrorCode.EXCHANGE_PERMANENT, json.retMsg, { retCode: json.retCode });
        }
        return json.result;
      } catch (error) {
        if (error instanceof AppError && error.code === ErrorCode.EXCHANGE_PERMANENT) throw error;
        if (attempt === 2) {
          throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, errorMessage(error), {}, { cause: error });
        }
        const delay = 1_000 * 2 ** attempt;
        log.warn({ attempt, delay, error }, "temporary Bybit error");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, "Retry loop exhausted");
  }
}
