import { describe, expect, it } from "vitest";
import { scaleCopyPosition } from "./copy/CopyRiskScaler.js";
import { weightedAverage } from "./dca/DCAPositionTracker.js";
import { calculateGridLevels } from "./grid/GridLevelManager.js";
import { ScalpStrategy } from "./scalp/ScalpStrategy.js";

describe("v3 strategy safety math", () => {
  it("keeps grid allocation inside its total budget", () => {
    const levels = calculateGridLevels(60_000, 70_000, 10, 500, 65_000);
    expect(levels).toHaveLength(10);
    expect(levels.reduce((sum, level) => sum + level.orderSizeUsdt, 0)).toBeCloseTo(500);
    expect(levels[0]?.price).toBe(60_000);
    expect(levels.at(-1)?.price).toBe(70_000);
  });

  it("calculates a quantity-weighted DCA entry", () => {
    expect(weightedAverage([{ qty: 1, price: 100 }, { qty: 3, price: 80 }])).toBe(85);
  });

  it("caps copied size and leverage", () => {
    expect(scaleCopyPosition(2, 1_000, 20, 200, 10, 5)).toEqual({ positionUsdt: 200, leverage: 5 });
  });

  it("hard-caps scalp leverage at three", () => {
    const strategy = new ScalpStrategy({
      id: "scalp", type: "SCALP", exchange: "bybit", symbol: "BTCUSDT", status: "PAPER",
      maxPositionUsdt: 100, dailyLossLimit: 10, maxDrawdownPct: 5, isPaperTrading: true,
      params: { leverageMax: 20 },
    });
    expect(strategy.maxLeverage).toBe(3);
  });
});
