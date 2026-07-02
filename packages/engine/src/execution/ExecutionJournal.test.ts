import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  journalEntry: {
    create: vi.fn(),
  },
  trade: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({ prisma: prismaMock }));

import { ExecutionJournal } from "./ExecutionJournal.js";

describe("ExecutionJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records journal entries with an optional trade id", async () => {
    await new ExecutionJournal().record("ORDER_INTENT", { ok: true }, "trade-1");

    expect(prismaMock.journalEntry.create).toHaveBeenCalledWith({
      data: { type: "ORDER_INTENT", data: { ok: true }, tradeId: "trade-1" },
    });
  });

  it("closes a trade and records realized PnL", async () => {
    prismaMock.trade.findUniqueOrThrow.mockResolvedValue({
      id: "trade-1",
      positionSizeUsdt: 100,
      openedAt: new Date(Date.now() - 60_000),
    });

    await new ExecutionJournal().closeTrade("trade-1", 100, 101, 102, 5, 0.1, 0.2);

    expect(prismaMock.trade.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "trade-1" },
      data: expect.objectContaining({
        status: "CLOSED",
        entryPrice: 101,
        exitPrice: 102,
        feeUsdt: 0.30000000000000004,
        pnlUsdt: 4.7,
      }),
    }));
    expect(prismaMock.journalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "POSITION_CLOSED", tradeId: "trade-1" }),
    }));
  });

  it("uses exchange-reported reconciliation PnL without subtracting fees again", async () => {
    const openedAt = new Date(Date.now() - 60_000);
    prismaMock.trade.findUniqueOrThrow.mockResolvedValue({
      id: "trade-1",
      positionSizeUsdt: 100,
      openedAt,
    });
    const closedAt = new Date();

    const result = await new ExecutionJournal().closeTrade({
      tradeId: "trade-1",
      intendedPrice: 100,
      fillPrice: 100,
      exitPrice: 105,
      feeUsdt: 0.1,
      pnlUsdt: 5,
      closeReason: "TAKE_PROFIT",
      closedAt,
    });

    expect(result.pnlUsdt).toBe(5);
    expect(result.feeUsdt).toBe(0.1);
    expect(prismaMock.trade.update).toHaveBeenCalledWith(expect.objectContaining({
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
    }));
  });
});
