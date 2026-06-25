import { describe, expect, it, vi } from "vitest";
import { ExchangeRouter } from "./ExchangeRouter.js";
import type { IExchangeAdapter, OrderParams } from "./IExchangeAdapter.js";

function adapter(exchangeId: "bybit" | "binance"): IExchangeAdapter {
  return {
    exchangeId,
    paperTrading: true,
    subscribeCandles: vi.fn(),
    subscribeTicker: vi.fn(),
    getBestBidAsk: vi.fn(),
    getHistoricalCandles: vi.fn(),
    getWalletBalance: vi.fn(),
    getOpenPositions: vi.fn(),
    getFundingRate: vi.fn(),
    placeOrder: vi.fn(async (params: OrderParams) => ({
      exchangeOrderId: `${exchangeId}-1`, clientOrderId: params.clientOrderId, symbol: params.symbol,
      side: params.side, status: "Filled" as const, avgFillPrice: 100, filledQty: params.qty, feeUsdt: 0, timestamp: 1,
    })),
    cancelOrder: vi.fn(),
    setLeverage: vi.fn(),
    ping: vi.fn(),
    getServerTime: vi.fn(),
  };
}

describe("ExchangeRouter", () => {
  it("routes an order only to the selected exchange", async () => {
    const bybit = adapter("bybit");
    const binance = adapter("binance");
    const router = new ExchangeRouter([bybit, binance]);
    await router.placeOrder("binance", {
      symbol: "BTCUSDT", side: "Buy", orderType: "Market", qty: 1, clientOrderId: "test-1",
    });
    expect(binance.placeOrder).toHaveBeenCalledOnce();
    expect(bybit.placeOrder).not.toHaveBeenCalled();
  });
});
