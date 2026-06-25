import { getEnv, prisma, strategyCatalog } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const strategiesRouter = router({
  list: protectedProcedure.query(async () => {
    const [tradeStats, openTrades, metricRows] = await Promise.all([
      prisma.trade.groupBy({
        by: ["strategyId"],
        _sum: { pnlUsdt: true, feeUsdt: true },
        _count: true,
      }),
      prisma.trade.groupBy({
        by: ["strategyId"],
        where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } },
        _sum: { positionSizeUsdt: true },
        _count: true,
      }),
      prisma.strategyMetrics.findMany({ orderBy: { date: "desc" } }),
    ]);
    return strategyCatalog(getEnv()).map((strategy) => {
      const trades = tradeStats.find((item) => item.strategyId === strategy.id);
      const open = openTrades.find((item) => item.strategyId === strategy.id);
      const latest = metricRows.find((item) => item.strategyId === strategy.id);
      return {
        ...strategy,
        status: !strategy.enabled ? "DISABLED" : strategy.isPaperTrading ? "PAPER" : "LIVE",
        pnlUsdt: latest?.pnlUsdt ?? trades?._sum.pnlUsdt ?? 0,
        feesUsdt: latest?.feesUsdt ?? trades?._sum.feeUsdt ?? 0,
        tradeCount: latest?.tradeCount ?? trades?._count ?? 0,
        winCount: latest?.winCount ?? 0,
        openPositions: open?._count ?? 0,
        openExposureUsdt: open?._sum.positionSizeUsdt ?? 0,
      };
    });
  }),
});
