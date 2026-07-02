import { describe, expect, it, vi } from "vitest";

vi.mock("@obsidra/shared", () => ({
  AppError: class AppError extends Error {
    constructor(public code: string, message: string) { super(message); }
  },
  ErrorCode: {
    EXCHANGE_PERMANENT: "EXCHANGE_PERMANENT",
    EXCHANGE_TEMPORARY: "EXCHANGE_TEMPORARY",
  },
  moduleLogger: () => ({ warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }),
}));

import { BinanceRestClient } from "./BinanceRestClient.js";

class TestBinanceRestClient extends BinanceRestClient {
  readonly calls: Array<{ method: string; path: string; params: Record<string, string> }> = [];
  constructor(private readonly responses: unknown[]) {
    super("key", "secret", true, false);
  }

  override async signed<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string>): Promise<T> {
    this.calls.push({ method, path, params });
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    return next as T;
  }
}

describe("BinanceRestClient live order accounting", () => {
  it("polls market fill price, maps real status and records USDT commission", async () => {
    const client = new TestBinanceRestClient([
      { orderId: 123, avgPrice: "0", executedQty: "0", status: "NEW" },
      { orderId: 123, avgPrice: "100.50", executedQty: "1.25", status: "FILLED" },
      [{ commission: "0.042", commissionAsset: "USDT" }],
    ]);

    const result = await client.placeOrder({
      symbol: "BTCUSDT",
      side: "Buy",
      orderType: "Market",
      qty: 1.25,
      clientOrderId: "client-1",
    });

    expect(result).toMatchObject({
      exchangeOrderId: "123",
      status: "Filled",
      avgFillPrice: 100.5,
      filledQty: 1.25,
      feeUsdt: 0.042,
    });
    expect(client.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /fapi/v1/order",
      "GET /fapi/v1/order",
      "GET /fapi/v1/userTrades",
    ]);
  });

  it("keeps unfilled live limit orders as New without pretending they filled", async () => {
    const client = new TestBinanceRestClient([
      { orderId: 456, avgPrice: "0", executedQty: "0", status: "NEW" },
    ]);

    const result = await client.placeOrder({
      symbol: "ETHUSDT",
      side: "Sell",
      orderType: "Limit",
      qty: 2,
      price: 2500,
      clientOrderId: "client-2",
    });

    expect(result).toMatchObject({
      exchangeOrderId: "456",
      status: "New",
      avgFillPrice: 0,
      filledQty: 0,
      feeUsdt: 0,
    });
    expect(client.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["POST /fapi/v1/order"]);
  });

  it("rejects non-USDT commission assets instead of silently understating fees", async () => {
    const client = new TestBinanceRestClient([
      { orderId: 789, avgPrice: "100", executedQty: "1", status: "FILLED" },
      [{ commission: "0.001", commissionAsset: "BNB" }],
    ]);

    await expect(client.placeOrder({
      symbol: "BTCUSDT",
      side: "Buy",
      orderType: "Market",
      qty: 1,
      clientOrderId: "client-3",
    })).rejects.toThrow(/Unsupported Binance commission asset BNB/);
  });
});
