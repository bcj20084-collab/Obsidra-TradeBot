import { getEnv, tradingSymbols, prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const symbolsRouter = router({
  list: protectedProcedure.query(async () => {
    const symbols = tradingSymbols(getEnv());
    const trades = await prisma.trade.groupBy({
      by: ["symbol"],
      _sum: { pnlUsdt: true },
      _count: true,
    });
    return symbols.map((symbol) => {
      const stats = trades.find((item) => item.symbol === symbol);
      return { symbol, enabled: true, pnl: stats?._sum.pnlUsdt ?? 0, trades: stats?._count ?? 0 };
    });
  }),
  scanner: protectedProcedure.query(async () => {
    const latest = await prisma.journalEntry.findFirst({ where: { type: "AI_MARKET_SCAN" }, orderBy: { createdAt: "desc" } });
    const data = latest?.data as { markets?: unknown[]; best?: unknown } | undefined;
    return {
      updatedAt: latest?.createdAt.toISOString() ?? null,
      best: data?.best ?? null,
      markets: Array.isArray(data?.markets) ? data.markets : [],
    };
  }),
});
