import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { compare } from "bcryptjs";
import { getEnv, prisma } from "@obsidra/shared";
import { clearSession, createSession, readSession } from "./auth/session.js";
import { ipWhitelist } from "./middleware/ipWhitelist.js";
import { clearLoginAttempts, loginRateLimiter } from "./middleware/rateLimiter.js";
import { appRouter } from "./routers/index.js";
import { createContext } from "./trpc.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.set({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    next();
  });
  app.use(cors({ origin: env.API_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.set("trust proxy", 1);
  app.use(ipWhitelist);

  app.get("/health", (_request, response) => response.json({
    ok: true,
    service: "obsidra-api",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
  app.get("/health/deep", async (_request, response) => {
    const since24h = new Date(Date.now() - 86_400_000);
    const since6h = new Date(Date.now() - 6 * 3_600_000);
    try {
      const [state, latestTrade, latestOpenTrade, openTrades, recentTrades6h, openPositionsCount, signalsReady24h, signalsSkipped24h, riskRejected24h, riskRejectedEvents24h, latestSignalEvent, dbCheck] = await Promise.all([
        prisma.botState.findUnique({ where: { id: "singleton" } }),
        prisma.trade.findFirst({ orderBy: { updatedAt: "desc" }, select: { symbol: true, status: true, updatedAt: true, closedAt: true } }),
        prisma.trade.findFirst({
          where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            symbol: true,
            exchange: true,
            executionMode: true,
            direction: true,
            status: true,
            entryPrice: true,
            stopLoss: true,
            takeProfit: true,
            positionSizeUsdt: true,
            leverage: true,
            signalScore: true,
            openedAt: true,
            updatedAt: true,
            signalData: true,
          },
        }),
        prisma.trade.findMany({
          where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } },
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: {
            id: true,
            symbol: true,
            exchange: true,
            executionMode: true,
            direction: true,
            status: true,
            entryPrice: true,
            exitPrice: true,
            stopLoss: true,
            takeProfit: true,
            positionSizeUsdt: true,
            leverage: true,
            pnlUsdt: true,
            pnlPct: true,
            closeReason: true,
            signalScore: true,
            openedAt: true,
            closedAt: true,
            updatedAt: true,
            signalData: true,
          },
        }),
        prisma.trade.findMany({
          where: {
            OR: [
              { openedAt: { gte: since6h } },
              { closedAt: { gte: since6h } },
              { updatedAt: { gte: since6h }, status: { in: ["OPEN", "FILLED", "CLOSING"] } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            symbol: true,
            exchange: true,
            executionMode: true,
            direction: true,
            status: true,
            entryPrice: true,
            exitPrice: true,
            stopLoss: true,
            takeProfit: true,
            positionSizeUsdt: true,
            leverage: true,
            pnlUsdt: true,
            pnlPct: true,
            closeReason: true,
            signalScore: true,
            openedAt: true,
            closedAt: true,
            updatedAt: true,
            signalData: true,
          },
        }),
        prisma.trade.count({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } }),
        prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_READY", "SIGNAL_GENERATED"] }, createdAt: { gte: since24h } } }),
        prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_SKIPPED", "RISK_REJECTED"] }, createdAt: { gte: since24h } } }),
        prisma.journalEntry.count({ where: { type: "RISK_REJECTED", createdAt: { gte: since24h } } }),
        prisma.journalEntry.findMany({
          where: { type: "RISK_REJECTED", createdAt: { gte: since24h } },
          select: { data: true },
          take: 250,
        }),
        prisma.journalEntry.findFirst({
          where: { type: { in: ["SIGNAL_READY", "SIGNAL_SKIPPED", "SIGNAL_GENERATED", "RISK_REJECTED"] } },
          orderBy: { createdAt: "desc" },
          select: { type: true, data: true, createdAt: true },
        }),
        prisma.$queryRaw`SELECT 1`,
      ]);
      const blockedByOpenPosition24h = riskRejectedEvents24h.filter((entry) => riskReason(entry.data) === "Open position already exists").length;
      const lastTradeAt = latestTrade?.closedAt ?? latestTrade?.updatedAt ?? null;
      const lastTradeAgeHours = lastTradeAt ? (Date.now() - lastTradeAt.getTime()) / 3_600_000 : null;
      response.json({
        ok: true,
        service: "obsidra-api",
        db: Boolean(dbCheck),
        botStatus: state?.status ?? "UNKNOWN",
        botReason: state?.reason ?? null,
        uptimeSeconds: Math.round(process.uptime()),
        openPositionsCount,
        latestTrade,
        latestOpenTrade: latestOpenTrade ? {
          id: latestOpenTrade.id,
          symbol: latestOpenTrade.symbol,
          exchange: latestOpenTrade.exchange,
          executionMode: latestOpenTrade.executionMode,
          direction: latestOpenTrade.direction,
          status: latestOpenTrade.status,
          entryPrice: latestOpenTrade.entryPrice,
          stopLoss: latestOpenTrade.stopLoss,
          takeProfit: latestOpenTrade.takeProfit,
          positionSizeUsdt: latestOpenTrade.positionSizeUsdt,
          leverage: latestOpenTrade.leverage,
          signalScore: latestOpenTrade.signalScore,
          openedAt: latestOpenTrade.openedAt,
          updatedAt: latestOpenTrade.updatedAt,
          protection: publicPaperProtection(latestOpenTrade.signalData),
        } : null,
        openTrades: openTrades.map(publicTradeSummary),
        recentTrades6h: recentTrades6h.map(publicTradeSummary),
        recentClosedTrades6h: recentTrades6h.filter((trade) => trade.closedAt).length,
        lastTradeAgeHours,
        signalsReady24h,
        signalsSkipped24h,
        riskRejected24h,
        riskBlockedByOpenPosition24h: blockedByOpenPosition24h,
        actionableRiskRejected24h: Math.max(0, riskRejected24h - blockedByOpenPosition24h),
        latestSignalEvent,
        timestamp: new Date().toISOString(),
      });
    } catch {
      response.status(503).json({
        ok: false,
        service: "obsidra-api",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }
  });
  app.get("/ready", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ ready: true });
    } catch {
      response.status(503).json({ ready: false });
    }
  });
  app.get("/auth/session", (request, response) => response.json({ authenticated: Boolean(readSession(request)) }));
  app.post("/auth/login", loginRateLimiter, async (request, response) => {
    const requestIp = request.ip ?? "unknown";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const expected = env.DASHBOARD_PASSWORD_HASH || env.DASHBOARD_PASSWORD;
    const valid = expected.startsWith("$2") ? await compare(password, expected) : constantTimeEqual(password, expected);
    if (!valid) {
      void prisma.auditLog.create({
        data: { action: "LOGIN_FAILED", actor: "dashboard", details: {}, ipAddress: requestIp },
      }).catch(() => undefined);
      response.status(401).json({ error: "Invalid credentials" });
      return;
    }
    clearLoginAttempts(requestIp);
    createSession(response);
    void prisma.auditLog.create({
      data: { action: "LOGIN_SUCCESS", actor: "dashboard", details: {}, ipAddress: requestIp },
    }).catch(() => undefined);
    response.json({ ok: true });
  });
  app.post("/auth/logout", (_request, response) => {
    clearSession(response);
    response.json({ ok: true });
  });
  app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  const dashboardDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dashboard/dist",
  );
  app.use(express.static(dashboardDist));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(dashboardDist, "index.html"));
  });
  return app;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index++) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}

function publicPaperProtection(signalData: unknown) {
  if (!signalData || typeof signalData !== "object") return null;
  const protection = (signalData as Record<string, unknown>).paperProtection;
  if (!protection || typeof protection !== "object") return null;
  const record = protection as Record<string, unknown>;
  return {
    tp1Hit: Boolean(record.tp1Hit),
    tp2Hit: Boolean(record.tp2Hit),
    breakevenMoved: Boolean(record.breakevenMoved),
    trailingActivated: Boolean(record.trailingActivated),
    partialRealizedPnlUsdt: safeNumber(record.partialRealizedPnlUsdt),
    partialFeeUsdt: safeNumber(record.partialFeeUsdt),
    initialPositionSizeUsdt: safeNumber(record.initialPositionSizeUsdt),
    initialStopLoss: safeNumber(record.initialStopLoss),
    highestPrice: safeNumber(record.highestPrice),
    lowestPrice: safeNumber(record.lowestPrice),
    currentPrice: safeNumber(record.currentPrice),
    unrealizedPnlUsdt: safeNumber(record.unrealizedPnlUsdt),
    profitR: safeNumber(record.profitR),
  };
}

function publicTradeSummary(trade: {
  id: string;
  symbol: string;
  exchange: string;
  executionMode: string;
  direction: string;
  status: string;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  positionSizeUsdt: number;
  leverage: number;
  pnlUsdt: number | null;
  pnlPct: number | null;
  closeReason: string | null;
  signalScore: number;
  openedAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
  signalData: unknown;
}) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    exchange: trade.exchange,
    executionMode: trade.executionMode,
    direction: trade.direction,
    status: trade.status,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    positionSizeUsdt: trade.positionSizeUsdt,
    leverage: trade.leverage,
    pnlUsdt: trade.pnlUsdt,
    pnlPct: trade.pnlPct,
    closeReason: trade.closeReason,
    signalScore: trade.signalScore,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    updatedAt: trade.updatedAt,
    protection: publicPaperProtection(trade.signalData),
  };
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function riskReason(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const decision = (data as Record<string, unknown>).decision;
  if (!decision || typeof decision !== "object") return null;
  const reason = (decision as Record<string, unknown>).reason;
  return typeof reason === "string" ? reason : null;
}
