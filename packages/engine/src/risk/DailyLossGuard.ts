import { prisma } from "@obsidra/shared";

export class DailyLossGuard {
  constructor(private readonly limitUsdt: number) {}

  async check(): Promise<{ allowed: boolean; realizedPnl: number }> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const aggregate = await prisma.trade.aggregate({
      where: { closedAt: { gte: start } },
      _sum: { pnlUsdt: true },
    });
    const realizedPnl = aggregate._sum.pnlUsdt ?? 0;
    return { allowed: realizedPnl > -this.limitUsdt, realizedPnl };
  }
}
