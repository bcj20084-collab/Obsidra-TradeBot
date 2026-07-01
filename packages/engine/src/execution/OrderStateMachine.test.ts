import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  trade: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  orderTransition: {
    create: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({
  prisma: prismaMock,
  AppError: class AppError extends Error {
    constructor(public code: string, message: string) { super(message); }
  },
  ErrorCode: { INVALID_TRANSITION: "INVALID_TRANSITION" },
}));

import type { ExecutionJournal } from "./ExecutionJournal.js";
import { OrderStateMachine } from "./OrderStateMachine.js";

describe("OrderStateMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.trade.updateMany.mockResolvedValue({ count: 1 });
  });

  it("persists a valid transition and journal entry", async () => {
    const journal = { record: vi.fn().mockResolvedValue(undefined) } as unknown as ExecutionJournal;
    const machine = new OrderStateMachine(journal);

    await machine.transition("trade-1", "SUBMITTED", "submitted");

    expect(prismaMock.trade.updateMany).toHaveBeenCalledWith({
      where: { id: "trade-1", status: { in: ["PENDING"] } },
      data: { status: "SUBMITTED" },
    });
    expect(prismaMock.orderTransition.create).toHaveBeenCalledWith({
      data: { tradeId: "trade-1", fromState: null, toState: "SUBMITTED", reason: "submitted", data: {} },
    });
    expect(journal.record).toHaveBeenCalledWith("STATE_TRANSITION", { toState: "SUBMITTED", reason: "submitted" }, "trade-1");
  });

  it("rejects invalid transitions with the current status", async () => {
    prismaMock.trade.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.trade.findUnique.mockResolvedValue({ status: "CLOSED" });
    const machine = new OrderStateMachine({ record: vi.fn() } as unknown as ExecutionJournal);

    await expect(machine.transition("trade-1", "OPEN", "invalid")).rejects.toThrow(/CLOSED -> OPEN/);
  });
});
