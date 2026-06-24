import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { login, requireAuth } from './auth/session.js';
import { router } from './trpc.js';
import { tradesRouter } from './routers/trades.js';
import { metricsRouter } from './routers/metrics.js';
import { configRouter } from './routers/config.js';
import { controlRouter } from './routers/control.js';

const appRouter = router({ trades: tradesRouter, metrics: metricsRouter, config: configRouter, control: controlRouter });
export type AppRouter = typeof appRouter;

const app = express();
app.use(cors({ origin: process.env.VITE_API_URL ?? true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/auth/login', login);
app.use('/trpc', requireAuth, createExpressMiddleware({ router: appRouter }));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`api listening on ${port}`));
