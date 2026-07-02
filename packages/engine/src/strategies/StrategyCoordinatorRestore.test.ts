import { describe, expect, it, vi } from "vitest";
import type { StrategyDescriptor } from "@obsidra/shared";
import { StrategyCoordinator } from "./StrategyCoordinator.js";
import { restoreStrategyCoordinator } from "./StrategyCoordinatorRestore.js";

describe("restoreStrategyCoordinator", () => {
  it("rebuilds in-memory conflicts from open trades, grid levels and DCA positions after restart", () => {
    const coordinator = new StrategyCoordinator(false, 1_000);
    const watchTradeClose = vi.fn();
    const descriptors = [
      descriptor("trend-btcusdt", "TREND", "bybit", "BTCUSDT"),
      descriptor("pullback-doge-4h", "PULLBACK", "binance", "DOGEUSDT"),
      descriptor("grid-primary", "GRID", "binance", "BTCUSDT"),
      descriptor("dca-primary", "DCA", "bybit", "ETHUSDT"),
    ];

    restoreStrategyCoordinator({
      coordinator,
      descriptors,
      watchTradeClose,
      openTrades: [
        { id: "trade-1", exchange: "bybit", symbol: "BTCUSDT", strategyId: "trend-btcusdt", direction: "LONG", positionSizeUsdt: 150 },
        { id: "trade-2", exchange: "binance", symbol: "DOGEUSDT", strategyId: "pullback-doge-4h", direction: "SHORT", positionSizeUsdt: 100 },
      ],
      gridLevels: [
        { exchange: "binance", symbol: "BTCUSDT", strategyId: "grid-primary", orderSizeUsdt: 40 },
        { exchange: "binance", symbol: "BTCUSDT", strategyId: "grid-primary", orderSizeUsdt: 60 },
      ],
      dcaPositions: [
        { exchange: "bybit", symbol: "ETHUSDT", strategyId: "dca-primary", direction: "LONG", totalInvestedUsdt: 250 },
      ],
    });

    expect(coordinator.check("bybit", "BTCUSDT", "SCALP", "LONG", 10, "scalp-btc").approved).toBe(false);
    expect(coordinator.check("binance", "DOGEUSDT", "TREND", "SHORT", 10, "trend-doge").approved).toBe(false);
    expect(coordinator.check("binance", "BTCUSDT", "DCA", "LONG", 10, "dca-btc").approved).toBe(false);
    expect(coordinator.check("bybit", "ETHUSDT", "TREND", "SHORT", 10, "trend-eth").approved).toBe(false);
    expect(watchTradeClose).toHaveBeenCalledTimes(2);
  });
});

function descriptor(id: string, type: StrategyDescriptor["type"], exchange: StrategyDescriptor["exchange"], symbol: string): StrategyDescriptor {
  return {
    id,
    type,
    enabled: true,
    exchange,
    symbol,
    isPaperTrading: true,
    maxPositionUsdt: 100,
    dailyLossLimit: 50,
    maxDrawdownPct: 8,
    params: {},
  };
}
