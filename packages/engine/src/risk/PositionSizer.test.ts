import { describe, expect, it } from "vitest";
import { calculatePositionSize, capPositionByStopRisk } from "./PositionSizer.js";

describe("calculatePositionSize", () => {
  it("uses one percent before enough history exists", () => {
    expect(calculatePositionSize(10_000, [], 500, 2)).toBe(100);
  });

  it("never exceeds caps", () => {
    const trades = Array.from({ length: 50 }, (_, index) => ({ pnlUsdt: index % 3 ? 20 : -10 }));
    expect(calculatePositionSize(10_000, trades, 500, 2)).toBeLessThanOrEqual(200);
  });

  it("blends bootstrap sizing with Kelly until enough history exists", () => {
    const smallSample = [
      { pnlUsdt: 50 },
      { pnlUsdt: 50 },
      { pnlUsdt: 50 },
      { pnlUsdt: 50 },
      { pnlUsdt: -10 },
      { pnlUsdt: 50 },
    ];

    const positionSize = calculatePositionSize(10_000, smallSample, 500, 5);

    expect(positionSize).toBeGreaterThan(100);
    expect(positionSize).toBeLessThan(150);
  });

  it("caps margin so the stop loss cannot exceed the risk budget", () => {
    expect(capPositionByStopRisk(1_000, 10_000, 100, 98, 5, 0.5)).toBe(500);
  });

  it("rejects a zero-distance stop", () => {
    expect(capPositionByStopRisk(1_000, 10_000, 100, 100, 5, 0.5)).toBe(0);
  });
});
