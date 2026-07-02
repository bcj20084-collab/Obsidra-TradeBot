import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trade: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  journalEntry: {
    create: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({
  prisma: prismaMock,
  moduleLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
  operatorLog: vi.fn(),
}));

import type { IExchangeAdapter } from "../exchanges/IExchangeAdapter.js";
import { ExecutionJournal } from "./ExecutionJournal.js";
import { ReconciliationService } from "./ReconciliationService.js";

describe("ReconciliationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes a local open trade that disappeared from the exchange", async () => {
    const openedAt = new Date(Date.now() - 10 * 60_000);
    prismaMock.trade.findMany.mockResolvedValue([{
      id: "trade-1",
      symbol: "BTCUSDT",
      exchange: "binance",
      direction: "LONG",
      entryPrice: 100,
      takeProfit: 105,
      stopLoss: 98,
      positionSizeUsdt: 100,
      openedAt,
      feeUsdt: 0,
    }]);
    prismaMock.trade.findUniqueOrThrow.mockResolvedValue({
      id: "trade-1",
      positionSizeUsdt: 100,
      openedAt,
    });
    const closedAt = Date.now();
    const adapter = {
      exchangeId: "binance",
      paperTrading: false,
      getOpenPositions: vi.fn().mockResolvedValue([]),
      getLatestClosedPosition: vi.fn().mockResolvedValue({
        symbol: "BTCUSDT",
        side: "Long",
        entryPrice: 100,
        exitPrice: 105,
        qty: 1,
        pnlUsdt: 5,
        feeUsdt: 0.1,
        closedAt,
      }),
    } as unknown as IExchangeAdapter;
    const journal = new ExecutionJournal();
    const notify = vi.fn().mockResolvedValue(undefined);

    await new ReconciliationService([adapter], journal, notify).reconcile("BTCUSDT");

    expect(prismaMock.trade.update).toHaveBeenCalledWith({
      where: { id: "trade-1" },
      data: expect.objectContaining({
        status: "CLOSED",
        closeReason: "TAKE_PROFIT",
        exitPrice: 105,
        feeUsdt: 0.1,
        pnlUsdt: 5,
        pnlPct: 5,
        slippage: 0,
      }),
    });
    expect(prismaMock.journalEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "RECONCILIATION_LOCAL_CLOSED",
        tradeId: "trade-1",
        data: expect.objectContaining({
          exchange: "binance",
          closeReason: "TAKE_PROFIT",
          pnlUsdt: 5,
        }),
      }),
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      symbol: "BTCUSDT",
      pnlUsdt: 5,
      reason: "TAKE_PROFIT",
    }));
  });
});
