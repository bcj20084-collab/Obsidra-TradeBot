import { getEnv, prisma, tradingSymbols, type AdaptiveConfig, type LiveMetrics, type MarketRegime } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const metricsRouter = router({
  live: protectedProcedure.query(async (): Promise<LiveMetrics> => {
    const state = await prisma.botState.findUnique({ where: { id: "singleton" } });
    const trades = await prisma.trade.findMany({ where: { status: "CLOSED" }, orderBy: { closedAt: "asc" } });
    const pnl = trades.map((trade) => trade.pnlUsdt ?? 0);
    const wins = pnl.filter((value) => value > 0);
    const losses = pnl.filter((value) => value < 0);
    const total = pnl.reduce((sum, value) => sum + value, 0);
    const daily = await prisma.dailyMetrics.findMany({ orderBy: { date: "asc" }, take: 30 });
    const defaultConfig: AdaptiveConfig = { minSignalScore: 65, slMultiplier: 1.5, tpMultiplier: 2.5, maxPositionPct: 2, leverageMax: 5, trailingStopPct: 1.5 };
    const perSymbolRegimes = await Promise.all(tradingSymbols(getEnv()).map(async (symbol) => {
      const latest = await prisma.adaptiveLog.findFirst({ where: { symbol }, orderBy: { createdAt: "desc" } });
      return {
        symbol,
        regime: (latest?.regime as MarketRegime | undefined) ?? "NORMAL",
        config: (latest?.config as unknown as AdaptiveConfig | undefined) ?? defaultConfig,
      };
    }));
    return {
      totalPnlUsdt: total,
      totalPnlPct: total / 100,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      profitFactor: losses.length ? wins.reduce((s, v) => s + v, 0) / Math.abs(losses.reduce((s, v) => s + v, 0)) : 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      totalTrades: trades.length,
      tradesLast24h: trades.filter((trade) => trade.closedAt && trade.closedAt >= new Date(Date.now() - 86_400_000)).length,
      avgHoldTimeMinutes: average(trades.map((trade) => (trade.holdTimeSeconds ?? 0) / 60)),
      avgWinUsdt: average(wins),
      avgLossUsdt: average(losses),
      avgSlippage: average(trades.map((trade) => (trade.slippage ?? 0) * 100)),
      totalFeesPaidUsdt: trades.reduce((sum, trade) => sum + (trade.feeUsdt ?? 0), 0),
      signalsGenerated24h: 0,
      signalsRejected24h: 0,
      uptime: 0,
      lastTradeAt: trades.at(-1)?.closedAt?.toISOString() ?? null,
      botStatus: (state?.status as LiveMetrics["botStatus"]) ?? "STOPPED",
      marketRegime: perSymbolRegimes[0]?.regime ?? "NORMAL",
      adaptiveConfig: perSymbolRegimes[0]?.config ?? defaultConfig,
      perSymbolRegimes,
      equityCurve: daily.map((item) => ({ date: item.date, equity: item.equityEnd })),
    };
  }),
});

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
