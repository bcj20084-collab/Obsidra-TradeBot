import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trade: {
    aggregate: vi.fn(),
    findMany: vi.fn(),
  },
  gridLevel: {
    findMany: vi.fn(),
  },
  dCAPosition: {
    findMany: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({ prisma: prismaMock }));

import { PortfolioRiskEngine } from "./PortfolioRiskEngine.js";

describe("PortfolioRiskEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.trade.findMany.mockResolvedValue([]);
    prismaMock.gridLevel.findMany.mockResolvedValue([]);
    prismaMock.dCAPosition.findMany.mockResolvedValue([]);
    prismaMock.trade.aggregate.mockResolvedValue({ _sum: { pnlUsdt: 0 } });
  });

  it("rejects when max portfolio positions are reached", async () => {
    prismaMock.trade.findMany.mockResolvedValue([openTrade("BTCUSDT", "binance", 100)]);
    const decision = await engine({ maxPositions: 1 }).approve("binance", "ETHUSDT", 10);
    expect(decision).toEqual({ approved: false, reason: "Maximum portfolio positions reached" });
  });

  it("rejects when total exposure is exceeded", async () => {
    prismaMock.trade.findMany.mockResolvedValue([openTrade("BTCUSDT", "binance", 95)]);
    const decision = await engine({ totalMax: 100 }).approve("binance", "ETHUSDT", 10);
    expect(decision).toEqual({ approved: false, reason: "Total portfolio exposure exceeded" });
  });

  it("rejects when per-symbol exposure is exceeded", async () => {
    prismaMock.trade.findMany.mockResolvedValue([openTrade("BTCUSDT", "binance", 95)]);
    const decision = await engine({ perSymbolMax: 100 }).approve("binance", "BTCUSDT", 10);
    expect(decision).toEqual({ approved: false, reason: "Per-symbol exposure exceeded" });
  });

  it("rejects when per-exchange exposure is exceeded", async () => {
    prismaMock.trade.findMany.mockResolvedValue([openTrade("ETHUSDT", "binance", 95)]);
    const decision = await engine({ binanceMax: 100 }).approve("binance", "BTCUSDT", 10);
    expect(decision).toEqual({ approved: false, reason: "Per-exchange exposure exceeded" });
  });

  it("rejects when global daily loss limit is reached", async () => {
    prismaMock.trade.aggregate.mockResolvedValue({ _sum: { pnlUsdt: -50 } });
    const decision = await engine({ dailyLossLimit: 50 }).approve("binance", "BTCUSDT", 10);
    expect(decision).toEqual({ approved: false, reason: "Total daily loss limit reached" });
  });

  it("approves when all portfolio limits pass", async () => {
    await expect(engine().approve("binance", "BTCUSDT", 10)).resolves.toEqual({ approved: true });
  });
});

function engine(overrides: Partial<ConstructorParameters<typeof PortfolioRiskEngine>[0]> = {}) {
  return new PortfolioRiskEngine({
    totalMax: 1_000,
    perSymbolMax: 500,
    bybitMax: 500,
    binanceMax: 500,
    dailyLossLimit: 100,
    maxPositions: 5,
    ...overrides,
  });
}

function openTrade(symbol: string, exchange: string, positionSizeUsdt: number) {
  return { symbol, exchange, positionSizeUsdt };
}
