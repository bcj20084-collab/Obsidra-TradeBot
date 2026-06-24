import { prisma } from "@obsidra/shared";
import type { Prisma } from "@prisma/client";

export class ExecutionJournal {
  async record(type: string, data: Record<string, unknown>, tradeId?: string): Promise<void> {
    await prisma.journalEntry.create({
      data: { type, data: data as Prisma.InputJsonValue, ...(tradeId ? { tradeId } : {}) },
    });
  }

  async closeTrade(
    tradeId: string,
    intendedPrice: number,
    fillPrice: number,
    exitPrice: number,
    grossPnl: number,
    entryFee: number,
    exitFee: number,
  ): Promise<void> {
    const trade = await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } });
    const feeUsdt = entryFee + exitFee;
    const pnlUsdt = grossPnl - feeUsdt;
    const slippage = Math.abs(fillPrice - intendedPrice) / intendedPrice;
    const closedAt = new Date();
    await prisma.trade.update({
      where: { id: tradeId },
      data: {
        status: "CLOSED",
        entryPrice: fillPrice,
        exitPrice,
        feeUsdt,
        pnlUsdt,
        pnlPct: (pnlUsdt / trade.positionSizeUsdt) * 100,
        slippage,
        closedAt,
        holdTimeSeconds: trade.openedAt ? Math.floor((closedAt.getTime() - trade.openedAt.getTime()) / 1000) : null,
      },
    });
    await this.record("POSITION_CLOSED", { exitPrice, grossPnl, feeUsdt, pnlUsdt, slippage }, tradeId);
  }

  getTradeHistory(limit: number, offset: number) {
    return prisma.trade.findMany({ orderBy: { createdAt: "desc" }, take: limit, skip: offset });
  }
}
