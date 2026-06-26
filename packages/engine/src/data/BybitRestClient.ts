import { createHash, createHmac, randomUUID } from "node:crypto";
import { AppError, ErrorCode, errorMessage, moduleLogger } from "@obsidra/shared";
import { TokenBucket } from "./TokenBucket.js";
import { ApiKeyManager, type ApiCredential } from "../security/ApiKeyManager.js";

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
const TIME_SYNC_TTL_MS = 5 * 60 * 1_000;

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
    const authFailure = response.status === 401 || response.status === 403;
    throw new AppError(
      authFailure ? ErrorCode.EXCHANGE_PERMANENT : ErrorCode.EXCHANGE_TEMPORARY,
      authFailure
        ? `Bybit auth failed (HTTP ${response.status}). Check API environment, key/secret, permissions and IP whitelist.`
        : `Bybit returned an empty response (HTTP ${response.status})`,
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
  private timeOffsetMs = 0;
  private timeOffsetSyncedAt = 0;

  constructor(
    apiKey: string,
    apiSecret: string,
    testnet: boolean,
    private readonly paperTrading: boolean,
    masterSecret = process.env.MASTER_SECRET ?? "development-only-master-secret-32",
    demo = false,
    fallbackCredentials: ApiCredential[] = [],
  ) {
    this.baseUrl = demo
      ? "https://api-demo.bybit.com"
      : testnet
        ? "https://api-testnet.bybit.com"
        : "https://api.bybit.com";
    this.keys = new ApiKeyManager(apiKey, apiSecret, masterSecret, fallbackCredentials);
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

  async syncServerTime(): Promise<number> {
    if (Date.now() - this.timeOffsetSyncedAt < TIME_SYNC_TTL_MS) return this.timeOffsetMs;
    try {
      const startedAt = Date.now();
      const response = await fetch(`${this.baseUrl}/v5/market/time`);
      const receivedAt = Date.now();
      if (!response.ok) return this.timeOffsetMs;
      const json = await response.json() as {
        result?: { timeNano?: string; timeSecond?: string };
        time?: number;
      };
      const serverTime = this.parseServerTime(json);
      if (!serverTime) return this.timeOffsetMs;
      const localMidpoint = Math.round((startedAt + receivedAt) / 2);
      this.timeOffsetMs = serverTime - localMidpoint;
      this.timeOffsetSyncedAt = receivedAt;
      return this.timeOffsetMs;
    } catch (error) {
      log.warn({ error }, "Bybit server time sync failed; using local clock");
      return this.timeOffsetMs;
    }
  }

  private async privateRequest<T = unknown>(
    method: "GET" | "POST",
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    await this.privateLimiter.take();
    const receiveWindow = "10000";
    const body = method === "POST" ? JSON.stringify(payload) : this.queryString(payload);
    const url = method === "GET" ? `${this.baseUrl}${path}?${body}` : `${this.baseUrl}${path}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const timeOffsetMs = await this.syncServerTime();
        const attemptTimestamp = Math.round(Date.now() + timeOffsetMs).toString();
        let lastPermanentAuthError: AppError | undefined;
        for (let credentialIndex = 0; credentialIndex < this.keys.credentialCount(); credentialIndex += 1) {
          try {
            const json = await this.requestWithCredential<T>(credentialIndex, method, path, url, body, attemptTimestamp, receiveWindow);
            return json.result;
          } catch (error) {
            if (error instanceof AppError && error.code === ErrorCode.EXCHANGE_PERMANENT) {
              lastPermanentAuthError = error;
              const hasFallback = credentialIndex + 1 < this.keys.credentialCount();
              log.warn({
                method,
                path,
                credentialSource: error.context.credentialSource,
                hasFallback,
                error,
              }, hasFallback ? "Bybit credential failed; trying fallback credential" : "Bybit credential failed");
              if (hasFallback) continue;
            }
            throw error;
          }
        }
        if (lastPermanentAuthError) throw lastPermanentAuthError;
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

  private async requestWithCredential<T>(
    credentialIndex: number,
    method: "GET" | "POST",
    path: string,
    url: string,
    body: string,
    timestamp: string,
    receiveWindow: string,
  ): Promise<BybitEnvelope<T>> {
    return this.keys.withCredentialAt(credentialIndex, async (credential) => {
      const keyFingerprint = this.fingerprint(credential.apiKey);
      const signature = createHmac("sha256", credential.apiSecret)
        .update(`${timestamp}${credential.apiKey}${receiveWindow}${body}`)
        .digest("hex");
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "X-BAPI-API-KEY": credential.apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-SIGN-TYPE": "2",
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": receiveWindow,
        "cdn-request-id": randomUUID(),
      };
      if (method === "POST") headers["Content-Type"] = "application/json";
      const response = await fetch(url, {
        method,
        headers,
        ...(method === "POST" ? { body } : {}),
      });
      this.lastHeartbeat = Date.now();
      const responseText = await response.text();
      let json: BybitEnvelope<T>;
      try {
        json = parseBybitEnvelope<T>(response, responseText, method, path);
      } catch (error) {
        if (error instanceof AppError && error.code === ErrorCode.EXCHANGE_PERMANENT) {
          throw new AppError(error.code, error.message, {
            ...error.context,
            credentialSource: credential.source,
            credentialKeyFingerprint: keyFingerprint,
            credentialKeyLength: credential.apiKey.length,
            bybitHost: new URL(this.baseUrl).hostname,
            timestampOffsetMs: this.timeOffsetMs,
            authHint: this.authHint(response.status),
            httpStatus: response.status,
          }, { cause: error });
        }
        throw error;
      }
      const context = {
        retCode: json.retCode,
        credentialSource: credential.source,
        credentialKeyFingerprint: keyFingerprint,
        credentialKeyLength: credential.apiKey.length,
        bybitHost: new URL(this.baseUrl).hostname,
        timestampOffsetMs: this.timeOffsetMs,
        httpStatus: response.status,
      };
      if (response.status === 429 || [500, 502, 503, 504].includes(response.status) || RETRYABLE_CODES.has(json.retCode)) {
        throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, json.retMsg ?? `HTTP ${response.status}`, context);
      }
      if ([401, 403].includes(response.status) || FATAL_CODES.has(json.retCode)) {
        throw new AppError(ErrorCode.EXCHANGE_PERMANENT, json.retMsg, context);
      }
      if (WARN_CODES.has(json.retCode)) {
        log.warn({ method, path, retCode: json.retCode }, "Bybit warn code; action skipped");
        return json;
      }
      if (!response.ok || json.retCode !== 0) {
        log.error({ method, path, retCode: json.retCode, message: json.retMsg }, "Bybit unexpected error");
        throw new AppError(ErrorCode.EXCHANGE_PERMANENT, json.retMsg ?? `Unexpected retCode ${json.retCode}`, context);
      }
      return json;
    });
  }

  private queryString(payload: Record<string, unknown>): string {
    const query = new URLSearchParams();
    for (const key of Object.keys(payload).sort()) {
      const value = payload[key];
      if (value === undefined || value === null) continue;
      query.set(key, String(value));
    }
    return query.toString();
  }

  private parseServerTime(json: { result?: { timeNano?: string; timeSecond?: string }; time?: number }): number | null {
    const nano = json.result?.timeNano;
    if (nano && /^\d+$/.test(nano)) return Math.round(Number(nano) / 1_000_000);
    const second = json.result?.timeSecond;
    if (second && /^\d+$/.test(second)) return Number(second) * 1_000;
    return typeof json.time === "number" && Number.isFinite(json.time) ? json.time : null;
  }

  private fingerprint(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 10);
  }

  private authHint(status: number): string {
    if (status === 401) {
      return "Bybit rejected the request before returning JSON. Most common causes: key/secret mismatch, key copied from Mainnet/Testnet instead of Demo Trading, missing derivatives permissions, or IP whitelist blocking Railway.";
    }
    if (status === 403) {
      return "Bybit refused access. Check account region restrictions and IP whitelist.";
    }
    return "Check Bybit API environment and credentials.";
  }
}
