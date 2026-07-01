import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trade: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({
  prisma: prismaMock,
  operatorLog: vi.fn(),
  premiumLog: vi.fn(),
}));

import type { SignalResult } from "@obsidra/shared";
import type { ExchangeRouter } from "../exchanges/ExchangeRouter.js";
import type { RiskDecision } from "../risk/RiskEngine.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";
import type { OrderStateMachine } from "./OrderStateMachine.js";
import { OrderManager } from "./OrderManager.js";

describe("OrderManager.execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.trade.create.mockResolvedValue({ id: "trade-1" });
    prismaMock.trade.update.mockResolvedValue({});
  });

  it("creates, submits and opens an order on the happy path", async () => {
    const calls: string[] = [];
    const exchange = exchangeRouter({
      setLeverage: vi.fn(async () => { calls.push("setLeverage"); }),
      placeOrder: vi.fn(async () => {
        calls.push("placeOrder");
        return orderResult();
      }),
    });
    const journal = journalMock(calls);
    const stateMachine = stateMachineMock(calls);

    const tradeId = await new OrderManager(exchange, stateMachine, journal).execute("BTCUSDT", signal(), risk(), "binance", "trend-btc");

    expect(tradeId).toBe("trade-1");
    expect(prismaMock.trade.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      symbol: "BTCUSDT",
      exchange: "binance",
      strategyId: "trend-btc",
      status: "PENDING",
      executionMode: "PAPER",
    }) });
    expect(stateMachine.transition).toHaveBeenNthCalledWith(1, "trade-1", "SUBMITTED", "Write-ahead transition before binance API");
    expect(stateMachine.transition).toHaveBeenNthCalledWith(2, "trade-1", "OPEN", "Order filled");
    expect(journal.record).toHaveBeenCalledWith("ORDER_INTENT", expect.any(Object), "trade-1");
    expect(journal.record).toHaveBeenCalledWith("ORDER_PLACED", expect.objectContaining({ exchangeOrderId: "ex-1" }), "trade-1");
    expect(calls).toEqual(["journal:ORDER_INTENT", "state:SUBMITTED", "setLeverage", "placeOrder", "state:OPEN", "journal:ORDER_PLACED"]);
  });

  it("transitions to ERROR when exchange placement throws after the DB row exists", async () => {
    const exchange = exchangeRouter({
      setLeverage: vi.fn(),
      placeOrder: vi.fn().mockRejectedValue(new Error("exchange down")),
    });
    const journal = journalMock();
    const stateMachine = stateMachineMock();

    await expect(new OrderManager(exchange, stateMachine, journal).execute("BTCUSDT", signal(), risk(), "binance", "trend-btc"))
      .rejects.toThrow(/exchange down/);

    expect(prismaMock.trade.create).toHaveBeenCalled();
    expect(stateMachine.transition).toHaveBeenCalledWith("trade-1", "SUBMITTED", "Write-ahead transition before binance API");
    expect(stateMachine.transition).toHaveBeenCalledWith("trade-1", "ERROR", "Order placement failed", { error: "Error: exchange down" });
  });
});

function exchangeRouter(overrides: { setLeverage: ReturnType<typeof vi.fn>; placeOrder: ReturnType<typeof vi.fn> }): ExchangeRouter {
  return {
    get: vi.fn().mockReturnValue({ paperTrading: true, setLeverage: overrides.setLeverage }),
    placeOrder: overrides.placeOrder,
  } as unknown as ExchangeRouter;
}

function journalMock(calls: string[] = []): ExecutionJournal {
  return {
    record: vi.fn(async (type: string) => { calls.push(`journal:${type}`); }),
  } as unknown as ExecutionJournal;
}

function stateMachineMock(calls: string[] = []): OrderStateMachine {
  return {
    transition: vi.fn(async (_tradeId: string, toState: string) => { calls.push(`state:${toState}`); }),
  } as unknown as OrderStateMachine;
}

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
    trendScore: 50,
    entryScore: 70,
    timestamp: 123,
  } as SignalResult;
}

function risk(): RiskDecision {
  return {
    approved: true,
    positionSizeUsdt: 100,
    leverage: 2,
    stopLossPrice: 99,
    takeProfitPrice: 103,
  } as RiskDecision;
}

function orderResult() {
  return {
    exchangeOrderId: "ex-1",
    clientOrderId: "client-1",
    symbol: "BTCUSDT",
    side: "Buy" as const,
    status: "Filled" as const,
    avgFillPrice: 100.5,
    filledQty: 2,
    feeUsdt: 0.1,
    timestamp: Date.now(),
  };
}
