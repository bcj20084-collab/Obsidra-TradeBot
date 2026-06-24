import { createHmac, randomUUID } from "node:crypto";
import { AppError, ErrorCode, errorMessage, moduleLogger } from "@obsidra/shared";
import { TokenBucket } from "./TokenBucket.js";

const log = moduleLogger("BybitRestClient");

export interface PlaceOrderRequest {
  symbol: string;
  side: "Buy" | "Sell";
  qty: string;
  stopLoss: string;
  takeProfit: string;
  clientOrderId?: string;
}

export class BybitRestClient {
  private readonly privateLimiter = new TokenBucket(10, 10);
  private readonly publicLimiter = new TokenBucket(50, 50);
  private lastHeartbeat = 0;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    testnet: boolean,
    private readonly paperTrading: boolean,
  ) {
    this.baseUrl = testnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  }

  getLastHeartbeat(): number {
    return this.lastHeartbeat;
  }

  async getOpenPositions(symbol: string): Promise<Array<Record<string, unknown>>> {
    if (this.paperTrading) return [];
    const result = await this.privateRequest<{ list: Array<Record<string, unknown>> }>(
      "GET",
      "/v5/position/list",
      { category: "linear", symbol },
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

  async publicGet<T>(path: string, params: Record<string, string>): Promise<T> {
    await this.publicLimiter.take();
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseUrl}${path}?${query}`);
    this.lastHeartbeat = Date.now();
    if (!response.ok) throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, `Bybit HTTP ${response.status}`);
    return (await response.json()) as T;
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
    const signature = createHmac("sha256", this.apiSecret)
      .update(`${timestamp}${this.apiKey}${receiveWindow}${body}`)
      .digest("hex");
    const url = method === "GET" ? `${this.baseUrl}${path}?${body}` : `${this.baseUrl}${path}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": this.apiKey,
            "X-BAPI-SIGN": signature,
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
        if (response.status === 429 || response.status >= 500) {
          throw new AppError(ErrorCode.EXCHANGE_TEMPORARY, json.retMsg);
        }
        if (!response.ok || json.retCode !== 0) {
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
