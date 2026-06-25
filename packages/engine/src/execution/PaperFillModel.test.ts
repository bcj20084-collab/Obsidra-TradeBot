import { describe, expect, it } from "vitest";
import { calculatePaperMarketFill } from "./PaperFillModel.js";

describe("calculatePaperMarketFill", () => {
  it("buys above the ask and includes taker fees", () => {
    const fill = calculatePaperMarketFill({
      side: "Buy",
      qty: 2,
      bid: 99,
      ask: 100,
      feeRate: 0.001,
      slippageBps: 10,
    });
    expect(fill.fillPrice).toBeCloseTo(100.1);
    expect(fill.feeUsdt).toBeCloseTo(0.2002);
  });

  it("sells below the bid", () => {
    const fill = calculatePaperMarketFill({
      side: "Sell",
      qty: 1,
      bid: 100,
      ask: 101,
      feeRate: 0,
      slippageBps: 10,
    });
    expect(fill.fillPrice).toBeCloseTo(99.9);
  });
});
