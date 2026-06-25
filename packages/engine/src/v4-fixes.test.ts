import { describe, expect, it, vi } from "vitest";
import { calculateOrderQuantity } from "./execution/ExecutionMath.js";
import type { OHLCVCandle } from "./exchanges/IExchangeAdapter.js";
import { TrendStrategy } from "./strategies/trend/TrendStrategy.js";

describe("v4 audit remediations", () => {
  it("uses leverage-adjusted quantity for opening and closing futures positions", () => {
    expect(calculateOrderQuantity(100, 5, 50_000)).toBe(0.01);
    expect(calculateOrderQuantity(100, 1, 50_000)).toBe(0.002);
  });

  it("routes confirmed 15-minute Trend candles through the configured exchange", async () => {
    const callback = vi.fn(async () => {});
    const strategy = new TrendStrategy({
      id: "trend-btc",
      type: "TREND",
      exchange: "binance",
      symbol: "BTCUSDT",
      status: "PAPER",
      maxPositionUsdt: 100,
      dailyLossLimit: 10,
      maxDrawdownPct: 5,
      isPaperTrading: true,
      params: {},
    }, callback);
    await strategy.start();
    await strategy.onCandle(candle("15", true));
    await strategy.onCandle(candle("1", true));
    await strategy.onCandle(candle("15", false));
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith("BTCUSDT", "binance");
  });
});

function candle(interval: string, confirmed: boolean): OHLCVCandle {
  return {
    symbol: "BTCUSDT",
    interval,
    openTime: 1,
    closeTime: 2,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
    confirmed,
  };
}
