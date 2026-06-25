import { describe, expect, it } from "vitest";
import { StrategyCoordinator } from "./StrategyCoordinator.js";

describe("StrategyCoordinator", () => {
  it("blocks scalp when trend is open on the same market", () => {
    const coordinator = new StrategyCoordinator(false, 1_000);
    coordinator.open("bybit", "BTCUSDT", { strategyId: "trend-btc", type: "TREND", direction: "LONG", sizeUsdt: 100 });
    expect(coordinator.check("bybit", "BTCUSDT", "SCALP", "LONG", 50, "scalp-btc").approved).toBe(false);
  });

  it("keeps grid exclusive while allowing its own levels", () => {
    const coordinator = new StrategyCoordinator(false, 1_000);
    coordinator.open("binance", "BTCUSDT", { strategyId: "grid-primary", type: "GRID", direction: "LONG", sizeUsdt: 50 });
    expect(coordinator.check("binance", "BTCUSDT", "GRID", "LONG", 50, "grid-primary").approved).toBe(true);
    expect(coordinator.check("binance", "BTCUSDT", "DCA", "LONG", 50, "dca-primary").approved).toBe(false);
  });

  it("enforces the per-symbol risk envelope", () => {
    const coordinator = new StrategyCoordinator(true, 200);
    coordinator.open("bybit", "ETHUSDT", { strategyId: "trend-eth", type: "TREND", direction: "LONG", sizeUsdt: 150 });
    expect(coordinator.check("bybit", "ETHUSDT", "DCA", "LONG", 51, "dca-eth").reason).toMatch(/exposure/i);
  });
});
