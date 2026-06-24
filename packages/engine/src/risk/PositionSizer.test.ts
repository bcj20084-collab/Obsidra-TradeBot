import { describe, expect, it } from "vitest";
import { calculatePositionSize } from "./PositionSizer.js";

describe("calculatePositionSize", () => {
  it("uses one percent before enough history exists", () => {
    expect(calculatePositionSize(10_000, [], 500, 2)).toBe(100);
  });

  it("never exceeds caps", () => {
    const trades = Array.from({ length: 50 }, (_, index) => ({ pnlUsdt: index % 3 ? 20 : -10 }));
    expect(calculatePositionSize(10_000, trades, 500, 2)).toBeLessThanOrEqual(200);
  });
});
