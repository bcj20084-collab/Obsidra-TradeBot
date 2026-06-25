import { createHmac, randomUUID } from "node:crypto";
import { AppError, ErrorCode, errorMessage, moduleLogger } from "@obsidra/shared";
import { TokenBucket } from "./TokenBucket.js";
import { ApiKeyManager } from "../security/ApiKeyManager.js";

const log = moduleLogger("BybitRestClient");

export interface PlaceOrderRequest {
  symbol: string;
  side: "Buy" | "Sell";
  qty: string;
  orderType?: "Market" | "Limit";
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  reduceOnly?: boolean;
  clientOrderId?: string;
}

const RETRYABLE_CODES = new Set([10006, 10016]);
const FATAL_CODES = new Set([10003, 10004, 110007, 110014, 110025]);
const WARN_CODES = new Set([110017]);

interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

export function parseBybitEnvelope<T>(
  response: Pick<Response, "ok" | "status" | "headers">,
  responseText: string,
  method: string,
  path: string,
): BybitEnvelope<T> {
  const contentType = response.headers.get("content-type") ?? "unknown";
  if (!responseText.trim()) {
    throw new AppError(
      response.status === 401 || response.status === 403 ? ErrorCode.EXCHANGE_PERMANENT : ErrorCode.EXCHANGE_TEMPORARY,
      `Bybit returned an empty response (HTTP ${response.status})`,
      { method, path, httpStatus: response.status, contentType, responseBytes: 0 },
    );
  }
  try {
    return JSON.parse(responseText) as BybitEnvelope<T>;
  } catch (error) {
    throw new AppError(
      response.ok ? ErrorCode.EXCHANGE_TEMPORARY : ErrorCode.EXCHANGE_PERMANENT,
      `Bybit returned a non-JSON response (HTTP ${response.status}, ${contentType})`,
      { method, path, httpStatus: response.status, contentType, responseBytes: responseText.length },
      { cause: error },
    );
  }
}

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
    demo = false,
  ) {
    this.baseUrl = demo
      ? "https://api-demo.bybit.com"
      : testnet
        ? "https://api-testnet.bybit.com"
        : "https://api.bybit.com";
    this.keys = new ApiKeyManager(apiKey, apiSecret, masterSecret);
  }

  getLastHeartbeat(): number {
    return this.lastHeartbeat;
  }

  get isPaperTrading(): boolean {
    return this.paperTrading;
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
      orderType: request.orderType ?? "Market",
      qty: request.qty,
      ...(request.price ? { price: request.price, timeInForce: "GTC" } : {}),
      ...(request.stopLoss ? { stopLoss: request.stopLoss } : {}),
      ...(request.takeProfit ? { takeProfit: request.takeProfit } : {}),
      ...(request.reduceOnly ? { reduceOnly: true } : {}),
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

  async getLatestClosedPosition(symbol: string): Promise<Record<string, unknown> | null> {
    if (this.paperTrading) return null;
    const result = await this.privateRequest<{ list: Array<Record<string, unknown>> }>(
      "GET",
      "/v5/position/closed-pnl",
      { category: "linear", symbol, limit: "1" },
    );
    return result.list[0] ?? null;
  }

  async getOrderHistory(symbol: string, clientOrderId: string): Promise<{ avgPrice: number; filledQty: number; status: string; feeUsdt: number } | null> {
    if (this.paperTrading) return null;
    const result = await this.privateRequest<{ list: Array<Record<string, unknown>> }>(
      "GET",
      "/v5/order/history",
      { category: "linear", symbol, orderLinkId: clientOrderId, limit: "1" },
    );
    const order = result.list[0];
    if (!order) return null;
    return {
      avgPrice: Number(order.avgPrice ?? 0),
      filledQty: Number(order.cumExecQty ?? 0),
      status: String(order.orderStatus ?? ""),
      feeUsdt: Number(order.cumExecFee ?? 0),
    };
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
    const receiveWindow = "5000";
    const body = method === "POST" ? JSON.stringify(payload) : new URLSearchParams(payload as Record<string, string>).toString();
    const url = method === "GET" ? `${this.baseUrl}${path}?${body}` : `${this.baseUrl}${path}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const attemptTimestamp = Date.now().toString();
        const attemptCredentials = this.keys.withCredentials((apiKey, apiSecret) => ({
          apiKey,
          signature: createHmac("sha256", apiSecret)
            .update(`${attemptTimestamp}${apiKey}${receiveWindow}${body}`)
            .digest("hex"),
        }));
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": attemptCredentials.apiKey,
            "X-BAPI-SIGN": attemptCredentials.signature,
            "X-BAPI-TIMESTAMP": attemptTimestamp,
            "X-BAPI-RECV-WINDOW": receiveWindow,
          },
          ...(method === "POST" ? { body } : {}),
        });
        this.lastHeartbeat = Date.now();
        const responseText = await response.text();
        const json = parseBybitEnvelope<T>(response, responseText, method, path);
        if (response.status === 429 || [500, 502, 503, 504].includes(response.status) || RETRYABLE_CODES.has(json.retCode)) {
          throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, json.retMsg ?? `HTTP ${response.status}`, { retCode: json.retCode });
        }
        if ([401, 403].includes(response.status) || FATAL_CODES.has(json.retCode)) {
          throw new AppError(ErrorCode.EXCHANGE_PERMANENT, json.retMsg, { retCode: json.retCode });
        }
        if (WARN_CODES.has(json.retCode)) {
          log.warn({ method, path, retCode: json.retCode }, "Bybit warn code; action skipped");
          return json.result;
        }
        if (!response.ok || json.retCode !== 0) {
          log.error({ method, path, retCode: json.retCode, message: json.retMsg }, "Bybit unexpected error");
          throw new AppError(ErrorCode.EXCHANGE_PERMANENT, json.retMsg ?? `Unexpected retCode ${json.retCode}`, { retCode: json.retCode });
        }
        return json.result;
      } catch (error) {
        if (error instanceof AppError && error.code === ErrorCode.EXCHANGE_PERMANENT) throw error;
        if (attempt === 2) {
          throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, errorMessage(error), {}, { cause: error });
        }
        const delay = 1_000 * 2 ** attempt;
        log.warn({
          attempt,
          delay,
          method,
          path,
          error,
          errorCode: error instanceof AppError ? error.code : undefined,
          errorContext: error instanceof AppError ? error.context : undefined,
        }, "temporary Bybit error");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, "Retry loop exhausted");
  }
}
