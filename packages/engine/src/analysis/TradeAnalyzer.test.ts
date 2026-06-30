import { describe, expect, it } from "vitest";
import { analyzeClosedTrade } from "./TradeAnalyzer.js";

describe("TradeAnalyzer", () => {
  it("classifies fast stop losses as high severity and recommends adaptive actions", () => {
    const analysis = analyzeClosedTrade({
      symbol: "ETHUSDT",
      direction: "SHORT",
      entryPrice: 1570,
      exitPrice: 1580,
      stopLoss: 1575,
      takeProfit: 1558,
      pnlUsdt: -1.7,
      pnlPct: -3.4,
      feeUsdt: 0.05,
      closeReason: "paper_stop_loss",
      signalScore: 69,
      marketRegime: "NORMAL",
      holdTimeSeconds: 8 * 60,
    });

    expect(analysis?.primaryCategory).toBe("STOP_LOSS_HIT");
    expect(analysis?.secondaryCategories).toContain("STOP_TOO_TIGHT");
    expect(analysis?.secondaryCategories).toContain("FAST_REVERSAL");
    expect(analysis?.severity).toBe("HIGH");
    expect(analysis?.suggestedScorePenalty).toBeGreaterThanOrEqual(8);
    expect(analysis?.adaptiveActions.some((item) => item.action === "extend_symbol_cooldown")).toBe(true);
  });

  it("does not analyze winning trades as losses", () => {
    expect(analyzeClosedTrade({
      symbol: "BTCUSDT",
      direction: "LONG",
      entryPrice: 100,
      exitPrice: 103,
      stopLoss: 98,
      takeProfit: 104,
      pnlUsdt: 1,
      pnlPct: 2,
      feeUsdt: 0.01,
      closeReason: "paper_take_profit",
      signalScore: 80,
      holdTimeSeconds: 60 * 30,
    })).toBeNull();
  });
});
