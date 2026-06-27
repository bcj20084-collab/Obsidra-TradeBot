import { getEnv, prisma, tradingSymbols, type AdaptiveConfig, type LiveMetrics, type MarketRegime } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const metricsRouter = router({
  live: protectedProcedure.query(async (): Promise<LiveMetrics> => {
    const state = await prisma.botState.findUnique({ where: { id: "singleton" } });
    const trades = await prisma.trade.findMany({ where: { status: "CLOSED" }, orderBy: { closedAt: "asc" } });
    const since24h = new Date(Date.now() - 86_400_000);
    const since6h = new Date(Date.now() - 6 * 3_600_000);
    const [signalsGenerated24h, signalsRejected24h, openTrades, recentErrors] = await Promise.all([
      prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_READY", "SIGNAL_GENERATED"] }, createdAt: { gte: since24h } } }),
      prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_SKIPPED", "RISK_REJECTED"] }, createdAt: { gte: since24h } } }),
      prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } }, select: { positionSizeUsdt: true } }),
      prisma.journalEntry.count({ where: { type: { contains: "FAILED" }, createdAt: { gte: since6h } } }),
    ]);
    const pnl = trades.map((trade) => trade.pnlUsdt ?? 0);
    const wins = pnl.filter((value) => value > 0);
    const losses = pnl.filter((value) => value < 0);
    const total = pnl.reduce((sum, value) => sum + value, 0);
    const daily = await prisma.dailyMetrics.findMany({ orderBy: { date: "asc" }, take: 30 });
    const recentClosed = trades.filter((trade) => trade.closedAt && trade.closedAt >= since24h);
    const recentPnl = recentClosed.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
    const latestClosed = [...trades].reverse().filter((trade) => trade.pnlUsdt !== null).slice(0, 10);
    const lossStreak = latestClosed.findIndex((trade) => (trade.pnlUsdt ?? 0) > 0);
    const consecutiveLosses = lossStreak === -1 ? latestClosed.length : lossStreak;
    const lastTradeAgeHours = trades.at(-1)?.closedAt ? (Date.now() - trades.at(-1)!.closedAt!.getTime()) / 3_600_000 : null;
    const defaultConfig: AdaptiveConfig = { minSignalScore: 65, slMultiplier: 1.5, tpMultiplier: 2.5, maxPositionPct: 2, leverageMax: 5, trailingStopPct: 1.5 };
    const perSymbolRegimes = await Promise.all(tradingSymbols(getEnv()).map(async (symbol) => {
      const latest = await prisma.adaptiveLog.findFirst({ where: { symbol }, orderBy: { createdAt: "desc" } });
      return {
        symbol,
        regime: (latest?.regime as MarketRegime | undefined) ?? "NORMAL",
        config: (latest?.config as unknown as AdaptiveConfig | undefined) ?? defaultConfig,
      };
    }));
    const totalExposureUsdt = openTrades.reduce((sum, trade) => sum + trade.positionSizeUsdt, 0);
    const safetySupervisor = buildSafetySupervisor({
      recentPnl,
      consecutiveLosses,
      recentErrors,
      signalsGenerated24h,
      signalsRejected24h,
      openPositionsCount: openTrades.length,
      totalExposureUsdt,
      lastTradeAgeHours,
    });
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
      tradesLast24h: trades.filter((trade) => trade.closedAt && trade.closedAt >= since24h).length,
      avgHoldTimeMinutes: average(trades.map((trade) => (trade.holdTimeSeconds ?? 0) / 60)),
      avgWinUsdt: average(wins),
      avgLossUsdt: average(losses),
      avgSlippage: average(trades.map((trade) => (trade.slippage ?? 0) * 100)),
      totalFeesPaidUsdt: trades.reduce((sum, trade) => sum + (trade.feeUsdt ?? 0), 0),
      signalsGenerated24h,
      signalsRejected24h,
      uptime: 0,
      lastTradeAt: trades.at(-1)?.closedAt?.toISOString() ?? null,
      botStatus: (state?.status as LiveMetrics["botStatus"]) ?? "STOPPED",
      marketRegime: perSymbolRegimes[0]?.regime ?? "NORMAL",
      adaptiveConfig: perSymbolRegimes[0]?.config ?? defaultConfig,
      perSymbolRegimes,
      equityCurve: daily.map((item) => ({ date: item.date, equity: item.equityEnd })),
      totalExposureUsdt,
      openPositionsCount: openTrades.length,
      safetySupervisor,
    };
  }),
});

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildSafetySupervisor(input: {
  recentPnl: number;
  consecutiveLosses: number;
  recentErrors: number;
  signalsGenerated24h: number;
  signalsRejected24h: number;
  openPositionsCount: number;
  totalExposureUsdt: number;
  lastTradeAgeHours: number | null;
}): NonNullable<LiveMetrics["safetySupervisor"]> {
  const checks: NonNullable<LiveMetrics["safetySupervisor"]>["checks"] = [
    {
      name: "24h PnL",
      status: input.recentPnl < -25 ? "FAIL" : input.recentPnl < 0 ? "WATCH" : "PASS",
      detail: `${input.recentPnl.toFixed(2)} USDT over the last 24h`,
    },
    {
      name: "Loss streak",
      status: input.consecutiveLosses >= 4 ? "FAIL" : input.consecutiveLosses >= 2 ? "WATCH" : "PASS",
      detail: `${input.consecutiveLosses} consecutive closed losses`,
    },
    {
      name: "Exchange/API errors",
      status: input.recentErrors >= 5 ? "FAIL" : input.recentErrors >= 2 ? "WATCH" : "PASS",
      detail: `${input.recentErrors} failed events in the last 6h`,
    },
    {
      name: "Signal activity",
      status: input.signalsGenerated24h === 0 && input.signalsRejected24h === 0 ? "WATCH" : "PASS",
      detail: `${input.signalsGenerated24h} ready / ${input.signalsRejected24h} skipped-rejected in 24h`,
    },
    {
      name: "Exposure",
      status: input.totalExposureUsdt > 150 ? "WATCH" : "PASS",
      detail: `${input.openPositionsCount} open positions / ${input.totalExposureUsdt.toFixed(2)} USDT exposure`,
    },
    {
      name: "Trade freshness",
      status: input.lastTradeAgeHours !== null && input.lastTradeAgeHours > 48 ? "WATCH" : "PASS",
      detail: input.lastTradeAgeHours === null ? "No closed trades yet" : `Last closed trade ${input.lastTradeAgeHours.toFixed(1)}h ago`,
    },
  ];
  const failures = checks.filter((check) => check.status === "FAIL").length;
  const watches = checks.filter((check) => check.status === "WATCH").length;
  const level = failures > 0 ? "DANGER" : watches > 0 ? "WATCH" : "OK";
  const score = Math.max(0, 100 - failures * 35 - watches * 12);
  return {
    level,
    score,
    summary: level === "OK" ? "Bot looks healthy in paper mode." : level === "WATCH" ? "Supervisor sees conditions worth watching." : "Supervisor detected a risk condition.",
    checks,
    updatedAt: new Date().toISOString(),
  };
}
