import { z } from "zod";
import { prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

const configSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]+$/),
  startDate: z.string(),
  endDate: z.string(),
  initialEquity: z.number().positive().default(10_000),
  commission: z.number().min(0).max(0.01).default(0.00055),
  slippage: z.number().min(0).max(0.01).default(0.0002),
});

export const backtestRouter = router({
  list: protectedProcedure.query(() => prisma.backtestResult.findMany({ orderBy: { createdAt: "desc" }, take: 10 })),
  run: protectedProcedure.input(configSchema).mutation(async ({ input }) => {
    const candles = await prisma.historicalCandle.findMany({
      where: {
        symbol: input.symbol,
        interval: "15",
        openTime: { gte: BigInt(new Date(input.startDate).getTime()), lte: BigInt(new Date(input.endDate).getTime()) },
      },
      orderBy: { openTime: "asc" },
    });
    const changes = candles.slice(1).map((candle, index) => (candle.close - candles[index]!.close) / candles[index]!.close);
    const pnl = changes.reduce((sum, value) => sum + value, 0) * input.initialEquity;
    const wins = changes.filter((value) => value > 0);
    const losses = changes.filter((value) => value < 0);
    const metrics = {
      totalTrades: changes.length,
      winRate: changes.length ? (wins.length / changes.length) * 100 : 0,
      profitFactor: losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)) : 0,
      totalPnlUsdt: pnl,
      totalPnlPct: (pnl / input.initialEquity) * 100,
      dataWarning: candles.length ? null : "Fetch historical candles before running a backtest",
    };
    return prisma.backtestResult.create({
      data: { symbol: input.symbol, startDate: input.startDate, endDate: input.endDate, config: input, metrics, equityCurve: [], trades: [] },
    });
  }),
});
