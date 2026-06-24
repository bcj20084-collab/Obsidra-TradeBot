import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';

export const tradesRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().min(1).max(100).default(20) })).query(({ input }) => ({ items: [], limit: input.limit })),
});
