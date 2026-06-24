import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';

let status: 'RUNNING' | 'PAUSED' | 'STOPPED' = 'RUNNING';

export const controlRouter = router({
  status: publicProcedure.query(() => ({ status })),
  setStatus: publicProcedure.input(z.object({ status: z.enum(['RUNNING', 'PAUSED', 'STOPPED']) })).mutation(({ input }) => { status = input.status; return { status }; }),
  kill: publicProcedure.mutation(() => { status = 'STOPPED'; return { status, message: 'Kill switch activated. Wire this to close positions before live use.' }; }),
});
