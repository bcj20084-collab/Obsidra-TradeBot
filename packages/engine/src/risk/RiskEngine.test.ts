import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trade: {
    aggregate: vi.fn(),
    findMany: vi.fn(),
  },
  dailyMetrics: {
    findMany: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({
  operatorLog: vi.fn(),
  premiumLog: vi.fn(),
  prisma: prismaMock,
}));

import type { SignalResult } from "@obsidra/shared";
import type { IExchangeAdapter } from "../exchanges/IExchangeAdapter.js";
import type { AdaptiveParams } from "../signals/AdaptiveParams.js";
import type { PreFlightCheck } from "./PreFlightCheck.js";
import { RiskEngine } from "./RiskEngine.js";

describe("RiskEngine paper sizing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.trade.aggregate.mockResolvedValue({ _sum: { pnlUsdt: 0 } });
    prismaMock.dailyMetrics.findMany.mockResolvedValue([{ equityEnd: 1_000 }]);
  });

  it("uses a small paper exploration size when Kelly sizing returns zero", async () => {
    prismaMock.trade.findMany.mockResolvedValue([
      { pnlUsdt: -10, closedAt: new Date(Date.now() - 10 * 60 * 60_000) },
      { pnlUsdt: 1, closedAt: new Date(Date.now() - 11 * 60 * 60_000) },
      { pnlUsdt: -10, closedAt: new Date(Date.now() - 12 * 60 * 60_000) },
      { pnlUsdt: 1, closedAt: new Date(Date.now() - 13 * 60 * 60_000) },
      { pnlUsdt: -10, closedAt: new Date(Date.now() - 14 * 60 * 60_000) },
      { pnlUsdt: 1, closedAt: new Date(Date.now() - 15 * 60 * 60_000) },
    ]);
    const engine = new RiskEngine(
      500,
      1_500,
      30,
      50,
      { run: vi.fn().mockResolvedValue({ allowed: true }) } as unknown as PreFlightCheck,
      {
        exchangeId: "binance",
        paperTrading: true,
        getWalletBalance: vi.fn().mockResolvedValue(1_000),
      } as unknown as IExchangeAdapter,
      {
        snapshot: {
          config: {
            maxPositionPct: 2,
            leverageMax: 5,
            trailingStopPct: 1.5,
          },
        },
      } as AdaptiveParams,
    );

    const decision = await engine.approve("BTCUSDT", signal());

    expect(decision.approved).toBe(true);
    expect(decision.positionSizeUsdt).toBeGreaterThan(0);
    expect(decision.positionSizeUsdt).toBeLessThanOrEqual(50);
    expect(decision.reason).toBeUndefined();
  });
});

function signal(): SignalResult {
  return {
    symbol: "BTCUSDT",
    direction: "LONG",
    entryPrice: 100,
    stopLoss: 99,
    takeProfit: 103,
    score: 70,
    confidence: 0.7,
    regime: "NORMAL",
    indicators: { atr: 1 },
    mlFeatures: {},
    mlAdjustment: 0,
    timestamp: Date.now(),
  } as SignalResult;
}
