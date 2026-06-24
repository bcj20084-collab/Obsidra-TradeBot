import { router, publicProcedure } from '../trpc.js';
import { store } from '../state/store.js';

export const metricsRouter = router({
  live: publicProcedure.query(() => ({
    totalPnlUsdt: 0,
    totalPnlPct: 0,
    winRate: 0,
    profitFactor: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    maxDrawdown: 0,
    currentDrawdown: 0,
    totalTrades: 0,
    tradesLast24h: 0,
    avgHoldTimeMinutes: 0,
    avgSlippage: 0,
    totalFeesPaidUsdt: 0,
    botStatus: store.status,
    uptime: store.snapshot().uptime,
    adaptiveConfig: store.config,
    marketRegime: 'NORMAL',
    equityCurve: [],
    updatedAt: new Date().toISOString(),
  })),
  events: publicProcedure.query(() => store.snapshot().events),
});
