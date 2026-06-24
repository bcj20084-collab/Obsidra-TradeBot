import { router } from "../trpc.js";
import { configRouter } from "./config.js";
import { controlRouter } from "./control.js";
import { metricsRouter } from "./metrics.js";
import { tradesRouter } from "./trades.js";
import { backtestRouter } from "./backtest.js";
import { symbolsRouter } from "./symbols.js";

export const appRouter = router({
  trades: tradesRouter,
  metrics: metricsRouter,
  config: configRouter,
  control: controlRouter,
  backtest: backtestRouter,
  symbols: symbolsRouter,
});

export type AppRouter = typeof appRouter;
