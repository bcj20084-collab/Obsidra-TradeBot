import { z } from "zod";
import { getEnv, prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const configRouter = router({
  get: protectedProcedure.query(() => {
    const env = getEnv();
    return {
      symbol: env.TRADING_SYMBOL,
      paperTrading: env.PAPER_TRADING,
      testnet: env.BYBIT_TESTNET,
      minSignalScore: env.MIN_SIGNAL_SCORE,
      leverageMax: env.TRADING_LEVERAGE_MAX,
      dailyLossLimitUsdt: env.DAILY_LOSS_LIMIT_USDT,
    };
  }),
  adaptiveHistory: protectedProcedure.query(() =>
    prisma.adaptiveLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ),
  events: protectedProcedure.query(() =>
    prisma.botEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ),
  validate: protectedProcedure
    .input(z.object({
      minSignalScore: z.number().min(55).max(85),
      leverageMax: z.number().int().min(1).max(10),
      dailyLossLimitUsdt: z.number().positive(),
    }))
    .mutation(({ input }) => ({ valid: true, input, note: "Persistent runtime overrides require a restart-safe settings table." })),
});
