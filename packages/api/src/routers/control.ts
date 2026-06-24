import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { store } from '../state/store.js';

export const controlRouter = router({
  status: publicProcedure.query(() => store.snapshot()),
  pause: publicProcedure.mutation(() => store.setStatus('PAUSED', 'New signal generation paused')),
  resume: publicProcedure.mutation(() => store.setStatus('RUNNING', 'New signal generation resumed')),
  stop: publicProcedure.mutation(() => store.setStatus('IDLE', 'Service moved to idle mode')),
  setConfig: publicProcedure.input(z.object({
    minSignalScore: z.number().min(55).max(85).optional(),
    leverageMax: z.number().min(1).max(10).optional(),
    dailyLossLimitUsdt: z.number().positive().max(10_000).optional(),
  })).mutation(({ input }) => store.updateConfig(input)),
});
