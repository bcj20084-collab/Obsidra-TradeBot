import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  dCAPosition: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  journalEntry: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({
  moduleLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
  prisma: prismaMock,
}));

import { DCAStrategy } from "./DCAStrategy.js";
import type { OHLCVCandle, OrderParams, OrderResult } from "../../exchanges/IExchangeAdapter.js";
import type { ExchangeRouter } from "../../exchanges/ExchangeRouter.js";
import type { StrategyConfig } from "../IStrategy.js";

describe("DCAStrategy fill accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.dCAPosition.findFirst.mockResolvedValue(null);
    prismaMock.dCAPosition.create.mockResolvedValue(waitingPosition());
    prismaMock.dCAPosition.update.mockImplementation(async (args) => ({ id: args.where.id, ...args.data }));
    prismaMock.journalEntry.create.mockResolvedValue({});
    prismaMock.journalEntry.findMany.mockResolvedValue([]);
  });

  it("stores the base order average entry from actual fill price, not candle close", async () => {
    const placeOrder = vi.fn<(_: "binance", params: OrderParams) => Promise<OrderResult>>()
      .mockResolvedValue(orderResult({ avgFillPrice: 100.2, filledQty: 0.499001996, feeUsdt: 0.0275 }));
    prismaMock.dCAPosition.findUniqueOrThrow.mockResolvedValueOnce(waitingPosition());

    const strategy = new DCAStrategy(config(), exchangeRouter(placeOrder), dependencies());
    await strategy.start();
    await strategy.onCandle(candle(100));

    expect(placeOrder).toHaveBeenCalledWith("binance", expect.objectContaining({
      orderType: "Market",
      qty: 0.5,
    }));
    expect(prismaMock.dCAPosition.update).toHaveBeenCalledWith({
      where: { id: "dca-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        averageEntryPrice: 100.2,
        totalQty: 0.499001996,
        totalInvestedUsdt: expect.closeTo(50, 8),
        targetPrice: expect.closeTo(101.703, 8),
        stopLossPrice: expect.closeTo(90.18, 8),
      }),
    });
    expect(prismaMock.journalEntry.create).toHaveBeenCalledWith({
      data: {
        type: "DCA_ORDER_PLACED",
        data: expect.objectContaining({
          positionId: "dca-1",
          intendedPrice: 100,
          avgFillPrice: 100.2,
          filledQty: 0.499001996,
          feeUsdt: 0.0275,
        }),
      },
    });
  });

  it("updates the safety order weighted average from actual fill quantity and price", async () => {
    const placeOrder = vi.fn<(_: "binance", params: OrderParams) => Promise<OrderResult>>()
      .mockResolvedValue(orderResult({ avgFillPrice: 98.5, filledQty: 1.015228426, feeUsdt: 0.055 }));
    const active = {
      ...waitingPosition(),
      status: "ACTIVE",
      averageEntryPrice: 100.2,
      totalQty: 0.499001996,
      totalInvestedUsdt: 50,
      safetyOrdersFilled: 0,
    };
    prismaMock.dCAPosition.findFirst.mockResolvedValue(active);
    prismaMock.dCAPosition.findUniqueOrThrow
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active);

    const strategy = new DCAStrategy(config(), exchangeRouter(placeOrder), dependencies());
    await strategy.start();
    await strategy.onCandle(candle(98));

    const expectedQty = 0.499001996 + 1.015228426;
    const expectedInvested = 50 + 98.5 * 1.015228426;
    const expectedAverage = expectedInvested / expectedQty;
    expect(prismaMock.dCAPosition.update).toHaveBeenCalledWith({
      where: { id: "dca-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        safetyOrdersFilled: { increment: 1 },
        totalQty: expect.closeTo(expectedQty, 8),
        totalInvestedUsdt: expect.closeTo(expectedInvested, 8),
        averageEntryPrice: expect.closeTo(expectedAverage, 8),
      }),
    });
    expect(prismaMock.journalEntry.create).toHaveBeenCalledWith({
      data: {
        type: "DCA_ORDER_PLACED",
        data: expect.objectContaining({
          positionId: "dca-1",
          intendedPrice: 98,
          avgFillPrice: 98.5,
          filledQty: 1.015228426,
          feeUsdt: 0.055,
        }),
      },
    });
  });
});

function config(): StrategyConfig {
  return {
    id: "dca-test",
    type: "DCA",
    exchange: "binance",
    symbol: "BTCUSDT",
    status: "RUNNING",
    isPaperTrading: true,
    maxPositionUsdt: 500,
    dailyLossLimit: 100,
    maxDrawdownPct: 8,
    params: {
      direction: "LONG",
      baseOrderUsdt: 50,
      safetyOrderUsdt: 100,
      safetyOrderCount: 5,
      priceDeviationPct: 2,
      targetProfitPct: 1.5,
      stopLossPct: 10,
    },
  };
}

function waitingPosition() {
  return {
    id: "dca-1",
    strategyId: "dca-test",
    symbol: "BTCUSDT",
    exchange: "binance",
    direction: "LONG",
    status: "WAITING",
    averageEntryPrice: null,
    totalQty: 0,
    totalInvestedUsdt: 0,
    safetyOrdersFilled: 0,
    targetPrice: null,
    stopLossPrice: null,
    cycleStartedAt: null,
  };
}

function candle(close: number): OHLCVCandle {
  return {
    symbol: "BTCUSDT",
    interval: "60",
    openTime: Date.now(),
    closeTime: Date.now(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    confirmed: true,
  };
}

function orderResult(overrides: Partial<OrderResult>): OrderResult {
  return {
    exchangeOrderId: "order-1",
    clientOrderId: "client-1",
    symbol: "BTCUSDT",
    side: "Buy",
    status: "Filled",
    avgFillPrice: 100,
    filledQty: 0.5,
    feeUsdt: 0,
    timestamp: Date.now(),
    ...overrides,
  };
}

function exchangeRouter(placeOrder: (_exchange: "binance", _params: OrderParams) => Promise<OrderResult>): ExchangeRouter {
  return { placeOrder } as unknown as ExchangeRouter;
}

function dependencies() {
  return {
    approveOrder: vi.fn().mockResolvedValue({ approved: true }),
    registerOpen: vi.fn(),
    unregisterOpen: vi.fn(),
  } as never;
}
