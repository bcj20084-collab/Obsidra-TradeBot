import { prisma, AppError, ErrorCode } from "@obsidra/shared";
import type { Prisma } from "@prisma/client";
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
    const trade = await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } });
    const fromState = trade.status as OrderState;
    if (!transitions[fromState]?.includes(toState)) {
      throw new AppError(ErrorCode.INVALID_TRANSITION, `${fromState} -> ${toState} is not allowed`);
    }
    await prisma.$transaction([
      prisma.orderTransition.create({ data: { tradeId, fromState, toState, reason, data: data as Prisma.InputJsonValue } }),
      prisma.trade.update({ where: { id: tradeId }, data: { status: toState } }),
    ]);
    await this.journal.record("STATE_TRANSITION", { fromState, toState, reason, ...data }, tradeId);
  }
}
