import { router, publicProcedure } from '../trpc.js';

export const configRouter = router({
  current: publicProcedure.query(() => ({ symbol: process.env.TRADING_SYMBOL ?? 'BTCUSDT', paperTrading: process.env.PAPER_TRADING !== 'false', testnet: process.env.BYBIT_TESTNET !== 'false' })),
});
