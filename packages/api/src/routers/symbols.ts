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
});
