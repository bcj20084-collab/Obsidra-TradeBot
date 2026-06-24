import { router, publicProcedure } from '../trpc.js';

export const metricsRouter = router({
  live: publicProcedure.query(() => ({ totalPnlUsdt: 0, winRate: 0, profitFactor: 0, botStatus: 'RUNNING', updatedAt: new Date().toISOString() })),
});
