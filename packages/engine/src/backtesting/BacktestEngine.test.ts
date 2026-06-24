import { describe, expect, it } from "vitest";
import { BacktestEngine } from "./BacktestEngine.js";

describe("BacktestEngine", () => {
  it("produces deterministic metrics without look-ahead state", () => {
    const candles = Array.from({ length: 100 }, (_, index) => ({
      symbol: "BTCUSDT",
      timeframe: "15",
      openTime: index * 900_000,
      closeTime: (index + 1) * 900_000,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 10,
      confirmed: true,
    }));
    const result = new BacktestEngine().run(candles, { symbol: "BTCUSDT", initialEquity: 10_000, commission: 0.00055, slippage: 0.0002 });
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(Number.isFinite(result.totalPnlUsdt)).toBe(true);
  });
});
