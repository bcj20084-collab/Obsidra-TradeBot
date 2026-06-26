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
      demo: env.BYBIT_DEMO,
      minSignalScore: env.MIN_SIGNAL_SCORE,
      leverageMax: env.TRADING_LEVERAGE_MAX,
      dailyLossLimitUsdt: env.DAILY_LOSS_LIMIT_USDT,
    };
  }),
  adaptiveHistory: protectedProcedure.query(() =>
    prisma.adaptiveLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ),
  mlTraining: protectedProcedure.query(async () => {
    const [latestWeights, history] = await Promise.all([
      prisma.mlWeights.findMany({ orderBy: { trainedAt: "desc" }, take: 10 }),
      prisma.mlTrainingLog.findMany({ orderBy: { trainedAt: "desc" }, take: 25 }),
    ]);
    return {
      latestWeights: latestWeights.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        tradeCount: item.tradeCount,
        cvAccuracy: item.cvAccuracy,
        cvLogLoss: item.cvLogLoss,
        wfEfficiency: item.wfEfficiency,
        trainedAt: item.trainedAt.toISOString(),
      })),
      history: history.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        tradeCount: item.tradeCount,
        cvAccuracy: item.cvAccuracy,
        cvLogLoss: item.cvLogLoss,
        wfEfficiency: item.wfEfficiency,
        savedWeights: item.savedWeights,
        rejectReason: item.rejectReason,
        featureImportance: item.featureImportance,
        trainedAt: item.trainedAt.toISOString(),
      })),
    };
  }),
  events: protectedProcedure.query(() =>
    prisma.botEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ),
  audit: protectedProcedure.query(() =>
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ),
  validate: protectedProcedure
    .input(z.object({
      minSignalScore: z.number().min(55).max(85),
      leverageMax: z.number().int().min(1).max(10),
      dailyLossLimitUsdt: z.number().positive(),
    }))
    .mutation(({ input }) => ({ valid: true, input, note: "Persistent runtime overrides require a restart-safe settings table." })),
});
