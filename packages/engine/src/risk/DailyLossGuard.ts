import { prisma } from "@obsidra/shared";

export class DailyLossGuard {
  constructor(private readonly limitUsdt: number, private readonly weeklyLimitUsdt = limitUsdt * 3) {}

  async check(): Promise<{ allowed: boolean; realizedPnl: number; weeklyPnl: number }> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const aggregate = await prisma.trade.aggregate({
      where: { closedAt: { gte: start } },
      _sum: { pnlUsdt: true },
    });
    const realizedPnl = aggregate._sum.pnlUsdt ?? 0;
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const weekly = await prisma.trade.aggregate({ where: { closedAt: { gte: weekStart } }, _sum: { pnlUsdt: true } });
    const weeklyPnl = weekly._sum.pnlUsdt ?? 0;
    return { allowed: realizedPnl > -this.limitUsdt && weeklyPnl > -this.weeklyLimitUsdt, realizedPnl, weeklyPnl };
  }
}
