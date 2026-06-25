import { prisma, AppError, ErrorCode, type Prisma } from "@obsidra/shared";
import type { ExecutionJournal } from "./ExecutionJournal.js";

export type OrderState =
  | "PENDING"
  | "SUBMITTED"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CLOSING"
  | "CLOSED"
  | "CANCELLED"
  | "ERROR";

const transitions: Record<OrderState, OrderState[]> = {
  PENDING: ["SUBMITTED", "CANCELLED", "ERROR"],
  SUBMITTED: ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "ERROR"],
  OPEN: ["PARTIALLY_FILLED", "FILLED", "CLOSING", "CANCELLED", "ERROR"],
  PARTIALLY_FILLED: ["FILLED", "CLOSING", "CANCELLED", "ERROR"],
  FILLED: ["CLOSING", "CLOSED", "ERROR"],
  CLOSING: ["CLOSED", "ERROR"],
  CLOSED: [],
  CANCELLED: [],
  ERROR: [],
};

export class OrderStateMachine {
  constructor(private readonly journal: ExecutionJournal) {}

  async transition(tradeId: string, toState: OrderState, reason: string, data: Record<string, unknown> = {}): Promise<void> {
    const validFromStates = Object.entries(transitions)
      .filter(([, targets]) => targets.includes(toState))
      .map(([fromState]) => fromState);
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.trade.updateMany({
        where: { id: tradeId, status: { in: validFromStates } },
        data: { status: toState },
      });
      if (updated.count === 0) {
        const current = await transaction.trade.findUnique({ where: { id: tradeId }, select: { status: true } });
        throw new AppError(ErrorCode.INVALID_TRANSITION, `${current?.status ?? "MISSING"} -> ${toState} is not allowed`);
      }
      await transaction.orderTransition.create({
        data: { tradeId, fromState: null, toState, reason, data: data as Prisma.InputJsonValue },
      });
    });
    await this.journal.record("STATE_TRANSITION", { toState, reason, ...data }, tradeId);
  }
}
