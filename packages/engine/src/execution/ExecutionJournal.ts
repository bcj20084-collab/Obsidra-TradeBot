import { prisma, type Prisma } from "@obsidra/shared";

export interface ClosedTradeUpdateResult {
  closedAt: Date;
  feeUsdt: number | null;
  holdTimeSeconds: number | null;
  pnlPct: number | null;
  pnlUsdt: number | null;
  slippage: number | null;
}

export interface CloseTradeInput {
  tradeId: string;
  intendedPrice: number;
  fillPrice: number;
  exitPrice: number;
  closeReason?: string;
  closedAt?: Date;
  entryFee?: number;
  exitFee?: number;
  feeUsdt?: number | null;
  grossPnl?: number | null;
  pnlUsdt?: number | null;
  pnlPct?: number | null;
}

export class ExecutionJournal {
  async record(type: string, data: Record<string, unknown>, tradeId?: string): Promise<void> {
    await prisma.journalEntry.create({
      data: { type, data: data as Prisma.InputJsonValue, ...(tradeId ? { tradeId } : {}) },
    });
  }

  async closeTrade(input: CloseTradeInput): Promise<ClosedTradeUpdateResult>;
  async closeTrade(
    tradeId: string,
    intendedPrice: number,
    fillPrice: number,
    exitPrice: number,
    grossPnl: number,
    entryFee: number,
    exitFee: number,
  ): Promise<ClosedTradeUpdateResult>;
  async closeTrade(
    inputOrTradeId: CloseTradeInput | string,
    intendedPrice?: number,
    fillPrice?: number,
    exitPrice?: number,
    grossPnl?: number,
    entryFee?: number,
    exitFee?: number,
  ): Promise<ClosedTradeUpdateResult> {
    const input: CloseTradeInput = typeof inputOrTradeId === "string"
      ? {
        tradeId: inputOrTradeId,
        intendedPrice: intendedPrice ?? 0,
        fillPrice: fillPrice ?? 0,
        exitPrice: exitPrice ?? 0,
        grossPnl: grossPnl ?? 0,
        entryFee: entryFee ?? 0,
        exitFee: exitFee ?? 0,
      }
      : inputOrTradeId;
    const trade = await prisma.trade.findUniqueOrThrow({ where: { id: input.tradeId } });
    const feeUsdt = input.feeUsdt ?? ((input.entryFee ?? 0) + (input.exitFee ?? 0));
    const pnlUsdt = input.pnlUsdt ?? (input.grossPnl == null || feeUsdt == null ? null : input.grossPnl - feeUsdt);
    const pnlPct = input.pnlPct ?? (pnlUsdt === null ? null : (pnlUsdt / Math.max(trade.positionSizeUsdt, Number.EPSILON)) * 100);
    const slippage = input.intendedPrice > 0 ? Math.abs(input.fillPrice - input.intendedPrice) / input.intendedPrice : null;
    const closedAt = input.closedAt ?? new Date();
    const holdTimeSeconds = trade.openedAt ? Math.floor((closedAt.getTime() - trade.openedAt.getTime()) / 1000) : null;
    await prisma.trade.update({
      where: { id: input.tradeId },
      data: {
        status: "CLOSED",
        entryPrice: input.fillPrice || null,
        exitPrice: input.exitPrice || null,
        feeUsdt,
        pnlUsdt,
        pnlPct,
        slippage,
        closedAt,
        holdTimeSeconds,
        ...(input.closeReason ? { closeReason: input.closeReason } : {}),
      },
    });
    await this.record("POSITION_CLOSED", {
      exitPrice: input.exitPrice,
      grossPnl: input.grossPnl ?? null,
      feeUsdt,
      pnlUsdt,
      slippage,
      closeReason: input.closeReason ?? null,
    }, input.tradeId);
    return { closedAt, feeUsdt, holdTimeSeconds, pnlPct, pnlUsdt, slippage };
  }

  getTradeHistory(limit: number, offset: number) {
    return prisma.trade.findMany({ orderBy: { createdAt: "desc" }, take: limit, skip: offset });
  }
}
