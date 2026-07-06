import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { compare } from "bcryptjs";
import { getEnv, prisma, strategyCatalog } from "@obsidra/shared";
import { clearSession, createSession, readSession } from "./auth/session.js";
import { ipWhitelist } from "./middleware/ipWhitelist.js";
import { clearLoginAttempts, loginRateLimiter } from "./middleware/rateLimiter.js";
import { appRouter } from "./routers/index.js";
import { createContext } from "./trpc.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  const activeStrategies = strategyCatalog(env).filter((strategy) => strategy.enabled).map((strategy) => ({
    id: strategy.id,
    type: strategy.type,
    exchange: strategy.exchange,
    symbol: strategy.symbol,
    mode: strategy.isPaperTrading ? "PAPER" : "LIVE",
    params: strategy.params,
  }));
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
      const [state, latestTrade, latestOpenTrade, openTrades, recentTrades6h, closedTrades24h, latestLossBrain, openPositionsCount, signalsReady24h, signalsSkipped24h, riskRejected24h, riskRejectedEvents24h, latestSignalEvent, recentSignalEvents, recentClosedTrades, dbCheck] = await Promise.all([
        prisma.botState.findUnique({ where: { id: "singleton" } }),
        prisma.trade.findFirst({ orderBy: { updatedAt: "desc" }, select: { symbol: true, status: true, updatedAt: true, closedAt: true } }),
        prisma.trade.findFirst({
          where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            symbol: true,
            exchange: true,
            strategyId: true,
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
            strategyId: true,
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
            strategyId: true,
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
          where: { status: "CLOSED", closedAt: { gte: since24h }, pnlUsdt: { not: null } },
          orderBy: { closedAt: "desc" },
          select: { symbol: true, exchange: true, strategyId: true, pnlUsdt: true, pnlPct: true, feeUsdt: true, closeReason: true, closedAt: true },
        }),
        prisma.journalEntry.findMany({
          where: { type: "TRADE_LOSS_ANALYZED", createdAt: { gte: since24h } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            data: true,
            createdAt: true,
            trade: { select: { symbol: true, direction: true, status: true, pnlUsdt: true, pnlPct: true, closeReason: true } },
          },
        }),
        prisma.trade.count({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } }),
        prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_READY", "SIGNAL_GENERATED"] }, createdAt: { gte: since24h } } }),
        prisma.journalEntry.count({ where: { type: { in: ["SIGNAL_SKIPPED", "RISK_REJECTED"] }, createdAt: { gte: since24h } } }),
        prisma.journalEntry.count({ where: { type: "RISK_REJECTED", createdAt: { gte: since24h } } }),
        prisma.journalEntry.findMany({
          where: { type: "RISK_REJECTED", createdAt: { gte: since24h } },
          select: { data: true, createdAt: true },
          take: 250,
        }),
        prisma.journalEntry.findFirst({
          where: { type: { in: ["SIGNAL_READY", "SIGNAL_SKIPPED", "SIGNAL_GENERATED", "RISK_REJECTED"] } },
          orderBy: { createdAt: "desc" },
          select: { type: true, data: true, createdAt: true },
        }),
        prisma.journalEntry.findMany({
          where: { type: { in: ["SIGNAL_READY", "SIGNAL_SKIPPED", "SIGNAL_GENERATED", "RISK_REJECTED"] }, createdAt: { gte: since24h } },
          orderBy: { createdAt: "desc" },
          take: 250,
          select: { type: true, data: true, createdAt: true },
        }),
        prisma.trade.findMany({
          where: { status: "CLOSED", pnlUsdt: { not: null } },
          orderBy: { closedAt: "desc" },
          take: 100,
          select: { symbol: true, exchange: true, strategyId: true, pnlUsdt: true, pnlPct: true, closeReason: true, closedAt: true },
        }),
        prisma.$queryRaw`SELECT 1`,
      ]);
      const blockedByOpenPosition24h = riskRejectedEvents24h.filter((entry) => riskReason(entry.data) === "Open position already exists").length;
      const publicLossBrain = latestLossBrain.map(publicLossBrainEntry);
      const lastTradeAt = latestTrade?.closedAt ?? latestTrade?.updatedAt ?? null;
      const lastTradeAgeHours = lastTradeAt ? (Date.now() - lastTradeAt.getTime()) / 3_600_000 : null;
      const pullbackControl = await buildPullbackControl(activeStrategies.find((strategy) => strategy.type === "PULLBACK"));
      const noTradeDiagnostics = buildNoTradeDiagnostics({
        strategies: activeStrategies,
        botStatus: state?.status ?? "UNKNOWN",
        openTrades: openTrades.map(publicTradeSummary),
        pullbackControl,
        recentSignalEvents,
        recentClosedTrades,
        signalsReady24h,
        signalsSkipped24h,
        lastTradeAgeHours,
      });
      const riskGateDiagnostics = buildRiskGateDiagnostics({
        strategies: activeStrategies,
        riskRejectedEvents: riskRejectedEvents24h,
        recentClosedTrades,
        openTrades: openTrades.map(publicTradeSummary),
      });
      const readyWatchdog = buildReadyWatchdog({
        strategies: activeStrategies,
        noTradeDiagnostics,
        riskGateDiagnostics,
        recentSignalEvents,
        openTrades: openTrades.map(publicTradeSummary),
      });
      const operatorReport24h = buildOperatorReport24h({
        closedTrades24h,
        noTradeDiagnostics,
        riskGateDiagnostics,
        readyWatchdog,
        signalsReady24h,
        signalsSkipped24h,
        riskRejected24h,
        openPositionsCount,
        lastTradeAgeHours,
      });
      response.json({
        ok: true,
        service: "obsidra-api",
        db: Boolean(dbCheck),
        deploy: publicDeployInfo(),
        botStatus: state?.status ?? "UNKNOWN",
        botReason: state?.reason ?? null,
        activeStrategies,
        pullbackControl,
        noTradeDiagnostics,
        riskGateDiagnostics,
        readyWatchdog,
        operatorReport24h,
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
        latestLossBrain: publicLossBrain.slice(0, 5),
        autoTuner: buildAutoTuner(publicLossBrain),
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
        db: false,
        deploy: publicDeployInfo(),
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

function publicDeployInfo() {
  return {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    railwayEnvironmentName: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    railwayServiceName: process.env.RAILWAY_SERVICE_NAME ?? null,
    railwayReplicaRegion: process.env.RAILWAY_REPLICA_REGION ?? null,
    railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN ?? null,
    railwayStaticUrl: process.env.RAILWAY_STATIC_URL ?? null,
    deploymentId: maskId(process.env.RAILWAY_DEPLOYMENT_ID),
    projectId: maskId(process.env.RAILWAY_PROJECT_ID),
    serviceId: maskId(process.env.RAILWAY_SERVICE_ID),
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
    commitBranch: process.env.RAILWAY_GIT_BRANCH ?? process.env.GIT_BRANCH ?? null,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  };
}

function maskId(value?: string): string | null {
  if (!value) return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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
    dangerAlerted: Boolean(record.dangerAlerted),
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
  strategyId: string;
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
    strategyId: trade.strategyId,
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

function publicLossBrainEntry(entry: {
  id: string;
  data: unknown;
  createdAt: Date;
  trade: { symbol: string; direction: string; status: string; pnlUsdt: number | null; pnlPct: number | null; closeReason: string | null } | null;
}) {
  const data = entry.data && typeof entry.data === "object" ? entry.data as Record<string, unknown> : {};
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    symbol: entry.trade?.symbol ?? "UNKNOWN",
    direction: entry.trade?.direction ?? "",
    status: entry.trade?.status ?? "",
    pnlUsdt: entry.trade?.pnlUsdt ?? null,
    pnlPct: entry.trade?.pnlPct ?? null,
    closeReason: entry.trade?.closeReason ?? null,
    primaryCategory: stringOrNull(data.primaryCategory),
    severity: stringOrNull(data.severity) ?? inferredSeverity(entry.trade?.pnlPct ?? null),
    confidence: safeNumber(data.confidence),
    summary: stringOrNull(data.summary),
    suggestedScorePenalty: safeNumber(data.suggestedScorePenalty),
    suggestedCooldownMinutes: safeNumber(data.suggestedCooldownMinutes),
    recommendations: Array.isArray(data.recommendations) ? data.recommendations.filter((item): item is string => typeof item === "string").slice(0, 4) : [],
    adaptiveActions: Array.isArray(data.adaptiveActions) ? data.adaptiveActions.slice(0, 4) : [],
  };
}

type PublicLossBrain = ReturnType<typeof publicLossBrainEntry>;

type ActiveStrategy = {
  id: string;
  type: string;
  exchange: string;
  symbol: string;
  mode: string;
  params: Record<string, unknown>;
};

type RecentSignalEvent = {
  type: string;
  data: unknown;
  createdAt: Date;
};

type RecentClosedTrade = {
  symbol: string;
  exchange: string;
  strategyId: string;
  pnlUsdt: number | null;
  pnlPct: number | null;
  closeReason: string | null;
  closedAt: Date | null;
};

type RiskRejectedEvent = {
  data: unknown;
  createdAt: Date;
};

type PublicTradeSummary = ReturnType<typeof publicTradeSummary>;
type NoTradeDiagnosticsResult = ReturnType<typeof buildNoTradeDiagnostics>;
type RiskGateDiagnosticsResult = ReturnType<typeof buildRiskGateDiagnostics>;

type ClosedTrade24h = {
  symbol: string;
  exchange: string;
  strategyId: string;
  pnlUsdt: number | null;
  pnlPct: number | null;
  feeUsdt: number | null;
  closeReason: string | null;
  closedAt: Date | null;
};

function buildReadyWatchdog(input: {
  strategies: ActiveStrategy[];
  noTradeDiagnostics: NoTradeDiagnosticsResult;
  riskGateDiagnostics: RiskGateDiagnosticsResult;
  recentSignalEvents: RecentSignalEvent[];
  openTrades: PublicTradeSummary[];
}) {
  const items = input.strategies.map((strategy) => {
    const noTrade = input.noTradeDiagnostics.items.find((item) => item.strategyId === strategy.id);
    const risk = input.riskGateDiagnostics.items.find((item) => item.strategyId === strategy.id);
    const latestReady = input.recentSignalEvents.find((event) => {
      if (!["SIGNAL_READY", "SIGNAL_GENERATED"].includes(event.type)) return false;
      const data = signalRecord(event.data);
      const signal = signalRecord(data.signal);
      return data.symbol === strategy.symbol || signal.symbol === strategy.symbol;
    });
    const open = input.openTrades.find((trade) => trade.strategyId === strategy.id || (trade.symbol === strategy.symbol && trade.exchange === strategy.exchange));
    const readyAgeMinutes = latestReady ? Math.round((Date.now() - latestReady.createdAt.getTime()) / 60_000) : null;
    const staleReady = Boolean(!open && readyAgeMinutes !== null && readyAgeMinutes >= 30 && risk?.level === "CLEAR");
    const status = open ? "EXECUTING" : staleReady ? "WATCH" : noTrade?.status === "READY" ? "READY" : "OK";
    return {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      exchange: strategy.exchange,
      status,
      readyAgeMinutes,
      latestReadyAt: latestReady?.createdAt ?? null,
      riskLevel: risk?.level ?? "UNKNOWN",
      noTradeStatus: noTrade?.status ?? "UNKNOWN",
      reason: open
        ? `Managing ${open.direction} ${open.status}.`
        : staleReady
          ? `Signal has been READY for ${readyAgeMinutes}m without execution.`
          : noTrade?.reason ?? "No ready signal waiting.",
      nextAction: open
        ? "Let trade monitor handle SL/TP/timeout."
        : staleReady
          ? "Inspect SignalEngine -> RiskEngine -> OrderManager path if this persists."
          : noTrade?.nextAction ?? "Continue scanning.",
    };
  });
  const watchCount = items.filter((item) => item.status === "WATCH").length;
  return {
    level: watchCount ? "WATCH" : "OK",
    summary: watchCount
      ? `${watchCount} ready signal(s) are aging without execution.`
      : "Ready watchdog is clean: no stale ready signals.",
    generatedAt: new Date().toISOString(),
    items,
  };
}

function buildOperatorReport24h(input: {
  closedTrades24h: ClosedTrade24h[];
  noTradeDiagnostics: NoTradeDiagnosticsResult;
  riskGateDiagnostics: RiskGateDiagnosticsResult;
  readyWatchdog: ReturnType<typeof buildReadyWatchdog>;
  signalsReady24h: number;
  signalsSkipped24h: number;
  riskRejected24h: number;
  openPositionsCount: number;
  lastTradeAgeHours: number | null;
}) {
  const pnl = input.closedTrades24h.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
  const fees = input.closedTrades24h.reduce((sum, trade) => sum + (trade.feeUsdt ?? 0), 0);
  const wins = input.closedTrades24h.filter((trade) => (trade.pnlUsdt ?? 0) > 0).length;
  const losses = input.closedTrades24h.filter((trade) => (trade.pnlUsdt ?? 0) < 0).length;
  const topBlocker = input.readyWatchdog.level === "WATCH"
    ? input.readyWatchdog.summary
    : input.riskGateDiagnostics.level !== "CLEAR"
      ? input.riskGateDiagnostics.summary
      : input.noTradeDiagnostics.summary;
  const recommendation = reportRecommendation({
    pnl,
    trades: input.closedTrades24h.length,
    readyWatchdogLevel: input.readyWatchdog.level,
    riskLevel: input.riskGateDiagnostics.level,
    signalsReady24h: input.signalsReady24h,
    signalsSkipped24h: input.signalsSkipped24h,
    lastTradeAgeHours: input.lastTradeAgeHours,
  });
  return {
    level: input.readyWatchdog.level === "WATCH" || input.riskGateDiagnostics.level !== "CLEAR" ? "WATCH" : pnl < 0 ? "LEARNING" : "OK",
    generatedAt: new Date().toISOString(),
    trades: input.closedTrades24h.length,
    wins,
    losses,
    winRate: input.closedTrades24h.length ? (wins / input.closedTrades24h.length) * 100 : 0,
    pnlUsdt: pnl,
    feesUsdt: fees,
    signalsReady24h: input.signalsReady24h,
    signalsSkipped24h: input.signalsSkipped24h,
    riskRejected24h: input.riskRejected24h,
    openPositionsCount: input.openPositionsCount,
    lastTradeAgeHours: input.lastTradeAgeHours,
    topBlocker,
    recommendation,
    symbols: summarizeReportSymbols(input.closedTrades24h),
  };
}

function reportRecommendation(input: {
  pnl: number;
  trades: number;
  readyWatchdogLevel: string;
  riskLevel: string;
  signalsReady24h: number;
  signalsSkipped24h: number;
  lastTradeAgeHours: number | null;
}): string {
  if (input.readyWatchdogLevel === "WATCH") return "Investigate stale READY signals before relaxing risk or adding more symbols.";
  if (input.riskLevel !== "CLEAR") return "Keep paper mode and let risk protections clear before changing thresholds.";
  if (input.trades === 0 && (input.lastTradeAgeHours ?? 0) > 24) return "No trades in 24h; keep watching signal quality and consider a controlled threshold review after more data.";
  if (input.pnl < 0) return "Stay in paper recovery mode; reduce size and collect more closed-trade evidence.";
  if (input.signalsReady24h > 0 && input.trades === 0) return "Signals appeared but no trades closed; inspect open/execution path if this repeats.";
  return "System is healthy; continue paper forward-test and avoid forcing trades.";
}

function summarizeReportSymbols(trades: ClosedTrade24h[]) {
  const map = new Map<string, { symbol: string; pnlUsdt: number; trades: number; wins: number; losses: number }>();
  for (const trade of trades) {
    const row = map.get(trade.symbol) ?? { symbol: trade.symbol, pnlUsdt: 0, trades: 0, wins: 0, losses: 0 };
    row.pnlUsdt += trade.pnlUsdt ?? 0;
    row.trades += 1;
    if ((trade.pnlUsdt ?? 0) > 0) row.wins += 1;
    if ((trade.pnlUsdt ?? 0) < 0) row.losses += 1;
    map.set(trade.symbol, row);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.pnlUsdt) - Math.abs(a.pnlUsdt)).slice(0, 8);
}

function buildRiskGateDiagnostics(input: {
  strategies: ActiveStrategy[];
  riskRejectedEvents: RiskRejectedEvent[];
  recentClosedTrades: RecentClosedTrade[];
  openTrades: PublicTradeSummary[];
}) {
  const items = input.strategies.map((strategy) => {
    const symbolEvents = input.riskRejectedEvents.filter((event) => {
      const data = signalRecord(event.data);
      const signal = signalRecord(data.signal);
      return signal.symbol === strategy.symbol || data.symbol === strategy.symbol;
    });
    const latest = symbolEvents[0] ?? null;
    const latestData = latest ? signalRecord(latest.data) : {};
    const latestDecision = signalRecord(latestData.decision);
    const latestSignal = signalRecord(latestData.signal);
    const recentClosed = input.recentClosedTrades.filter((trade) => trade.exchange === strategy.exchange && trade.symbol === strategy.symbol);
    const lossStreak = consecutiveLosses(recentClosed);
    const openExposure = input.openTrades
      .filter((trade) => trade.exchange === strategy.exchange)
      .reduce((sum, trade) => sum + trade.positionSizeUsdt, 0);
    const reason = stringOrNull(latestDecision.reason) ?? "No risk rejection in the last 24h";
    const level = latest
      ? reason.toLowerCase().includes("cooldown") ? "COOLDOWN"
        : reason.toLowerCase().includes("open position") ? "CONFLICT"
          : "REJECTED"
      : "CLEAR";
    return {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      exchange: strategy.exchange,
      type: strategy.type,
      level,
      rejectCount24h: symbolEvents.length,
      latestReason: reason,
      latestRejectedAt: latest?.createdAt ?? null,
      latestSignalScore: safeNumber(latestSignal.score),
      latestDirection: stringOrNull(latestSignal.direction),
      lossStreak,
      openExposureUsdt: openExposure,
      nextAction: riskGateNextAction(reason, lossStreak, symbolEvents.length),
    };
  });
  const rejected = items.filter((item) => item.level !== "CLEAR").length;
  return {
    level: rejected ? "WATCH" : "CLEAR",
    summary: rejected
      ? `${rejected} strategy has risk-gate rejection context in the last 24h.`
      : "Risk gate is clear: no actionable risk rejects in the last 24h.",
    generatedAt: new Date().toISOString(),
    items,
  };
}

function riskGateNextAction(reason: string, lossStreak: number, rejectCount: number): string {
  const lower = reason.toLowerCase();
  if (rejectCount === 0) return lossStreak >= 3 ? "Watch reduced sizing/cooldown after the loss streak." : "Risk gate is clear; wait for signal approval.";
  if (lower.includes("cooldown")) return "Let cooldown expire; bot should auto-retry on the next clean signal.";
  if (lower.includes("risk/reward")) return "Wait for a wider target or tighter stop before entering.";
  if (lower.includes("position sizing")) return "Position sizing is too small for current stop distance; wait for cleaner volatility.";
  if (lower.includes("open position")) return "Existing position/strategy conflict must clear before another entry.";
  if (lower.includes("drawdown") || lower.includes("daily loss")) return "Capital protection is active; do not force entries.";
  return "Review latest signal context; risk gate is protecting execution.";
}

function buildNoTradeDiagnostics(input: {
  strategies: ActiveStrategy[];
  botStatus: string;
  openTrades: PublicTradeSummary[];
  pullbackControl: Awaited<ReturnType<typeof buildPullbackControl>>;
  recentSignalEvents: RecentSignalEvent[];
  recentClosedTrades: RecentClosedTrade[];
  signalsReady24h: number;
  signalsSkipped24h: number;
  lastTradeAgeHours: number | null;
}) {
  const items = input.strategies.map((strategy) => {
    const openTrade = input.openTrades.find((trade) => trade.strategyId === strategy.id || (trade.symbol === strategy.symbol && trade.exchange === strategy.exchange));
    const latestSignal = latestSignalFor(input.recentSignalEvents, strategy);
    const signalData = signalRecord(latestSignal?.data);
    const signalDetails = recordOrEmpty(signalData.details);
    const signalAgeMinutes = latestSignal ? Math.round((Date.now() - latestSignal.createdAt.getTime()) / 60_000) : null;
    const recentClosed = input.recentClosedTrades.filter((trade) => trade.symbol === strategy.symbol && trade.exchange === strategy.exchange);
    const newestClosed = recentClosed[0];
    const lossStreak = consecutiveLosses(recentClosed);
    const pullback = strategy.type === "PULLBACK" && input.pullbackControl?.strategyId === strategy.id ? input.pullbackControl : null;

    if (input.botStatus !== "RUNNING") {
      return diagnosticItem(strategy, "PAUSED", "Bot is not RUNNING.", "Use /resume or Control Room when you want new entries.", latestSignal, recentClosed);
    }
    if (openTrade) {
      return diagnosticItem(strategy, "MANAGING", `${openTrade.symbol} ${openTrade.direction} is already open.`, "Bot is managing the existing paper position before opening another one.", latestSignal, recentClosed);
    }
    if (pullback) {
      const failed = pullback.checklist.filter((check) => !check.passed);
      const status = pullback.status === "SETUP_READY" ? "READY" : pullback.autoPauseRecommended ? "PROTECTED" : "WAITING";
      return {
        ...diagnosticItem(
          strategy,
          status,
          pullback.reason,
          failed[0]?.detail ?? (pullback.status === "SETUP_READY" ? "Risk gate can evaluate the next setup." : "Waiting for the next 4H confirmation."),
          latestSignal,
          recentClosed,
        ),
        checklist: pullback.checklist,
        edgeScore: pullback.edgeScore,
        nextCheckAt: pullback.nextCandleCloseAt,
        healthLevel: pullback.healthLevel,
        healthReason: pullback.healthReason,
      };
    }

    if (!latestSignal) {
      return diagnosticItem(strategy, "SCANNING", "No signal event recorded in the last 24h.", "Engine is collecting market data and waiting for a valid trend setup.", latestSignal, recentClosed);
    }

    const reason = String(signalData.reason ?? signalData.decision?.reason ?? latestSignal.type);
    if (reason === "CIRCUIT_BREAKER") {
      const blockedUntil = stringOrNull(signalDetails.blockedUntil);
      const remainingCooldownMinutes = safeNumber(signalDetails.remainingCooldownMinutes);
      return {
        ...diagnosticItem(
          strategy,
          blockedUntil || remainingCooldownMinutes ? "COOLING_DOWN" : "PROTECTED",
          `Circuit breaker: ${String(signalDetails.circuitBreakerReason ?? "safety pause")}.`,
          blockedUntil
            ? `Auto-recovery at ${new Date(blockedUntil).toLocaleString("en-GB", { timeZone: "Europe/Bucharest" })}.`
            : "Latest event was a safety block. New code auto-recovers temporary loss streak blocks.",
          latestSignal,
          recentClosed,
        ),
        blockedUntil,
        remainingCooldownMinutes,
      };
    }
    if (reason === "NO_TREND") {
      return diagnosticItem(strategy, "WAITING", `No valid trend for ${strategy.symbol}.`, trendDetail(signalDetails), latestSignal, recentClosed);
    }
    if (reason === "FUNDING_FILTER") {
      return diagnosticItem(strategy, "FILTERED", "Funding filter blocked the setup.", `Funding rate ${formatMaybeNumber(signalDetails.fundingRate)} is above allowed threshold.`, latestSignal, recentClosed);
    }
    if (latestSignal.type === "SIGNAL_READY" || latestSignal.type === "SIGNAL_GENERATED") {
      return diagnosticItem(strategy, "READY", `Signal ready for ${strategy.symbol}.`, "Risk engine can approve the next execution if guardrails pass.", latestSignal, recentClosed);
    }

    return diagnosticItem(
      strategy,
      lossStreak >= 3 ? "PROTECTED" : "WAITING",
      `${reason.replaceAll("_", " ").toLowerCase()} (${signalAgeMinutes ?? "?"}m ago).`,
      newestClosed && (newestClosed.pnlUsdt ?? 0) < 0
        ? `Last closed trade lost ${formatSignedNumber(newestClosed.pnlUsdt)} USDT via ${newestClosed.closeReason ?? "unknown"}.`
        : "Waiting for the next qualified setup.",
      latestSignal,
      recentClosed,
    );
  });
  const blocked = items.filter((item) => ["COOLING_DOWN", "PROTECTED", "PAUSED"].includes(item.status)).length;
  const ready = items.filter((item) => item.status === "READY").length;
  const waiting = items.length - blocked - ready;
  return {
    summary: ready > 0
      ? `${ready} strategy setup is ready for risk review.`
      : blocked > 0
        ? `${blocked} strategy guardrail(s) are protecting the bot; ${waiting} still scanning/waiting.`
        : "Bot is online and waiting for clean market setups.",
    generatedAt: new Date().toISOString(),
    signalsReady24h: input.signalsReady24h,
    signalsSkipped24h: input.signalsSkipped24h,
    lastTradeAgeHours: input.lastTradeAgeHours,
    items,
  };
}

function latestSignalFor(events: RecentSignalEvent[], strategy: ActiveStrategy): RecentSignalEvent | null {
  return events.find((event) => {
    const data = signalRecord(event.data);
    const details = recordOrEmpty(data.details);
    return (data.symbol === strategy.symbol || details.symbol === strategy.symbol)
      && (data.exchange === strategy.exchange || data.exchange === undefined);
  }) ?? null;
}

function signalRecord(data: unknown): Record<string, any> {
  return data && typeof data === "object" ? data as Record<string, any> : {};
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function diagnosticItem(strategy: ActiveStrategy, status: string, reason: string, nextAction: string, latestSignal: RecentSignalEvent | null | undefined, recentClosed: RecentClosedTrade[]) {
  const lastClosed = recentClosed[0] ?? null;
  return {
    strategyId: strategy.id,
    type: strategy.type,
    exchange: strategy.exchange,
    symbol: strategy.symbol,
    mode: strategy.mode,
    status,
    reason,
    nextAction,
    latestSignal: latestSignal ? {
      type: latestSignal.type,
      createdAt: latestSignal.createdAt,
      ageMinutes: Math.round((Date.now() - latestSignal.createdAt.getTime()) / 60_000),
      reason: String(signalRecord(latestSignal.data).reason ?? latestSignal.type),
    } : null,
    lossStreak: consecutiveLosses(recentClosed),
    lastClosedTrade: lastClosed ? {
      pnlUsdt: lastClosed.pnlUsdt,
      pnlPct: lastClosed.pnlPct,
      closeReason: lastClosed.closeReason,
      closedAt: lastClosed.closedAt,
    } : null,
  };
}

function consecutiveLosses(trades: RecentClosedTrade[]): number {
  const firstNonLoss = trades.findIndex((trade) => (trade.pnlUsdt ?? 0) >= 0);
  return firstNonLoss === -1 ? trades.length : firstNonLoss;
}

function trendDetail(details: Record<string, unknown>): string {
  const price = formatMaybeNumber(details.price);
  const adx = formatMaybeNumber(details.adx);
  const required = formatMaybeNumber(details.requiredAdx);
  return `Price ${price}, ADX ${adx}; needs ADX ${required} with EMA alignment.`;
}

function formatMaybeNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(value >= 10 ? 2 : 4) : "n/a";
}

function formatSignedNumber(value: number | null): string {
  if (value === null) return "0.00";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

async function buildPullbackControl(strategy: ActiveStrategy | undefined) {
  if (!strategy) return null;
  const params = strategy.params;
  const timeframe = String(params.timeframe ?? "240");
  const fastPeriod = numberParam(params.fastEma, 21);
  const slowPeriod = numberParam(params.slowEma, 89);
  const rsiLongBelow = numberParam(params.rsiLongBelow, 35);
  const rsiShortAbove = numberParam(params.rsiShortAbove, 55);
  const atrStopMultiplier = numberParam(params.atrStopMultiplier, 1.2);
  const atrTakeProfitMultiplier = numberParam(params.atrTakeProfitMultiplier, 1.8);
  const maxHoldCandles = numberParam(params.maxHoldCandles, 72);
  const maxDailyTrades = numberParam(params.maxDailyTrades, 4);
  const sinceDay = new Date();
  sinceDay.setUTCHours(0, 0, 0, 0);
  const [candlesDesc, tradesToday, recentTrades, openTrade] = await Promise.all([
    prisma.historicalCandle.findMany({
      where: { symbol: strategy.symbol, interval: timeframe },
      orderBy: { openTime: "desc" },
      take: Math.max(slowPeriod + 40, 160),
    }),
    prisma.trade.count({ where: { strategyId: strategy.id, createdAt: { gte: sinceDay } } }),
    prisma.trade.findMany({
      where: { strategyId: strategy.id, status: "CLOSED", pnlUsdt: { not: null } },
      orderBy: { closedAt: "desc" },
      take: 20,
      select: { pnlUsdt: true, pnlPct: true, closeReason: true, closedAt: true },
    }),
    prisma.trade.findFirst({
      where: { strategyId: strategy.id, status: { in: ["OPEN", "FILLED", "CLOSING"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, direction: true, entryPrice: true, stopLoss: true, takeProfit: true, openedAt: true, signalScore: true },
    }),
  ]);
  const candles = candlesDesc.reverse();
  const closes = candles.map((candle) => candle.close);
  const latest = candles.at(-1);
  const fast = closes.length >= fastPeriod ? ema(closes, fastPeriod).at(-1) ?? null : null;
  const slow = closes.length >= slowPeriod ? ema(closes, slowPeriod).at(-1) ?? null : null;
  const currentRsi = closes.length >= 15 ? rsi(closes.slice(-15)) : null;
  const currentAtr = candles.length >= 15 ? averageTrueRange(candles.slice(-15)) : null;
  const atrPct = latest && currentAtr ? (currentAtr / latest.close) * 100 : null;
  const trendPct = latest && fast !== null && slow !== null ? (Math.abs(fast - slow) / latest.close) * 100 : null;
  const longReady = Boolean(latest && fast !== null && slow !== null && currentRsi !== null && fast > slow && currentRsi <= rsiLongBelow && latest.close > slow);
  const shortReady = Boolean(latest && fast !== null && slow !== null && currentRsi !== null && fast < slow && currentRsi >= rsiShortAbove && latest.close < slow);
  const direction = longReady ? "LONG" : shortReady ? "SHORT" : "WAITING";
  const reason = pullbackReason({
    candles: candles.length,
    latestClose: latest?.close ?? null,
    fast,
    slow,
    rsi: currentRsi,
    rsiLongBelow,
    rsiShortAbove,
    tradesToday,
    maxDailyTrades,
    openTrade: Boolean(openTrade),
    direction,
  });
  const wins = recentTrades.filter((trade) => (trade.pnlUsdt ?? 0) > 0);
  const losses = recentTrades.filter((trade) => (trade.pnlUsdt ?? 0) < 0);
  const grossWins = wins.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0));
  const recentPnlUsdt = recentTrades.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0);
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 10 : null;
  const performanceGuard = pullbackPerformanceGuard(recentTrades.map((trade) => trade.pnlUsdt ?? 0), profitFactor, recentPnlUsdt);
  const riskRewardPreview = atrStopMultiplier > 0 ? atrTakeProfitMultiplier / atrStopMultiplier : null;
  const checklist = pullbackChecklist({
    candleCount: candles.length,
    openTrade: Boolean(openTrade),
    tradesToday,
    maxDailyTrades,
    fast,
    slow,
    rsi: currentRsi,
    rsiLongBelow,
    rsiShortAbove,
    price: latest?.close ?? null,
    atrPct,
    riskRewardPreview,
    healthLevel: performanceGuard.level,
  });
  const edgeScore = pullbackEdgeScore(checklist, trendPct, currentRsi, direction, performanceGuard.level);
  const nextCloseAt = latest ? new Date(Number(latest.openTime) + intervalMs(timeframe)).toISOString() : null;
  const forwardReport = pullbackForwardReport({
    trades: recentTrades.map((trade) => trade.pnlUsdt ?? 0),
    winRate: recentTrades.length ? (wins.length / recentTrades.length) * 100 : null,
    profitFactor,
    recentPnlUsdt,
  });
  return {
    strategyId: strategy.id,
    symbol: strategy.symbol,
    exchange: strategy.exchange,
    mode: strategy.mode,
    timeframe,
    status: direction === "WAITING" ? "WAITING" : "SETUP_READY",
    direction,
    reason,
    candleCount: candles.length,
    latestCandleAt: latest ? new Date(Number(latest.openTime)).toISOString() : null,
    nextCandleCloseAt: nextCloseAt,
    price: latest?.close ?? null,
    emaFast: fast,
    emaSlow: slow,
    rsi: currentRsi,
    atr: currentAtr,
    atrPct,
    trendPct,
    edgeScore,
    checklist,
    riskRewardPreview,
    stopLossPreview: latest && currentAtr && direction !== "WAITING"
      ? direction === "LONG" ? latest.close - currentAtr * atrStopMultiplier : latest.close + currentAtr * atrStopMultiplier
      : null,
    takeProfitPreview: latest && currentAtr && direction !== "WAITING"
      ? direction === "LONG" ? latest.close + currentAtr * atrTakeProfitMultiplier : latest.close - currentAtr * atrTakeProfitMultiplier
      : null,
    tradesToday,
    maxDailyTrades,
    maxHoldCandles,
    maxHoldHours: maxHoldCandles * intervalMs(timeframe) / 3_600_000,
    recentTrades: recentTrades.length,
    winRate: recentTrades.length ? (wins.length / recentTrades.length) * 100 : null,
    profitFactor,
    recentPnlUsdt,
    healthLevel: performanceGuard.level,
    healthReason: performanceGuard.reason,
    autoPauseRecommended: performanceGuard.autoPauseRecommended,
    lastClosedTrade: recentTrades[0] ?? null,
    forwardReport,
    openTrade,
  };
}

function pullbackChecklist(input: {
  candleCount: number;
  openTrade: boolean;
  tradesToday: number;
  maxDailyTrades: number;
  fast: number | null;
  slow: number | null;
  rsi: number | null;
  rsiLongBelow: number;
  rsiShortAbove: number;
  price: number | null;
  atrPct: number | null;
  riskRewardPreview: number | null;
  healthLevel: string;
}) {
  const bullish = input.fast !== null && input.slow !== null && input.fast > input.slow;
  const bearish = input.fast !== null && input.slow !== null && input.fast < input.slow;
  const trendAligned = Boolean(bullish || bearish);
  const rsiPullback = Boolean(
    input.rsi !== null && (
      (bullish && input.rsi <= input.rsiLongBelow)
      || (bearish && input.rsi >= input.rsiShortAbove)
    ),
  );
  const priceAligned = Boolean(
    input.price !== null && input.slow !== null && (
      (bullish && input.price > input.slow)
      || (bearish && input.price < input.slow)
    ),
  );
  return [
    { name: "Data ready", passed: input.candleCount >= 120, detail: `${input.candleCount}/120 DOGE 4H candles` },
    { name: "No active pullback trade", passed: !input.openTrade, detail: input.openTrade ? "Trade already open" : "Ready for next setup" },
    { name: "Daily cap available", passed: input.tradesToday < input.maxDailyTrades, detail: `${input.tradesToday}/${input.maxDailyTrades} trades today` },
    { name: "EMA trend aligned", passed: trendAligned, detail: bullish ? "Bullish EMA trend" : bearish ? "Bearish EMA trend" : "Flat EMA trend" },
    { name: "RSI pullback zone", passed: rsiPullback, detail: input.rsi === null ? "RSI unavailable" : `RSI ${input.rsi.toFixed(1)}` },
    { name: "Price on correct side", passed: priceAligned, detail: input.price === null || input.slow === null ? "Price/EMA unavailable" : `Price ${input.price.toFixed(5)} vs EMA slow ${input.slow.toFixed(5)}` },
    { name: "Volatility acceptable", passed: input.atrPct !== null && input.atrPct > 0 && input.atrPct <= 8, detail: input.atrPct === null ? "ATR unavailable" : `ATR ${input.atrPct.toFixed(2)}%` },
    { name: "Risk/reward valid", passed: (input.riskRewardPreview ?? 0) >= 1.5, detail: input.riskRewardPreview === null ? "RR unavailable" : `RR ${input.riskRewardPreview.toFixed(2)}` },
    { name: "Performance guard", passed: input.healthLevel !== "DANGER", detail: input.healthLevel },
  ];
}

function pullbackEdgeScore(
  checklist: Array<{ passed: boolean }>,
  trendPct: number | null,
  rsiValue: number | null,
  direction: string,
  healthLevel: string,
): number {
  const passedScore = (checklist.filter((item) => item.passed).length / Math.max(1, checklist.length)) * 70;
  const trendScore = Math.min(15, (trendPct ?? 0) * 6);
  const rsiScore = direction === "WAITING" || rsiValue === null ? 0 : Math.min(10, Math.abs(rsiValue - 50) * 0.35);
  const healthScore = healthLevel === "HEALTHY" ? 5 : healthLevel === "LEARNING" ? 2 : healthLevel === "WATCH" ? -3 : -15;
  return Math.round(Math.max(0, Math.min(100, passedScore + trendScore + rsiScore + healthScore)));
}

function pullbackPerformanceGuard(
  pnls: number[],
  profitFactor: number | null,
  recentPnlUsdt: number,
): { level: "LEARNING" | "HEALTHY" | "WATCH" | "DANGER"; reason: string; autoPauseRecommended: boolean } {
  const newestFirst = pnls.filter((value) => Number.isFinite(value));
  if (newestFirst.length < 5) {
    return { level: "LEARNING", reason: `Need ${5 - newestFirst.length} more closed pullback trades for a reliable read.`, autoPauseRecommended: false };
  }
  const lossStreak = newestFirst.findIndex((pnl) => pnl >= 0);
  const consecutiveLosses = lossStreak === -1 ? newestFirst.length : lossStreak;
  if (consecutiveLosses >= 3) {
    return { level: "DANGER", reason: `${consecutiveLosses} losses in a row. Auto-pause guard will block new entries.`, autoPauseRecommended: true };
  }
  if (newestFirst.length >= 10 && (profitFactor ?? 0) < 0.9 && recentPnlUsdt < 0) {
    return { level: "DANGER", reason: `Recent PF ${(profitFactor ?? 0).toFixed(2)} and PnL ${recentPnlUsdt.toFixed(2)} USDT. Auto-pause recommended.`, autoPauseRecommended: true };
  }
  if ((profitFactor ?? 0) < 1 || recentPnlUsdt < 0) {
    return { level: "WATCH", reason: `Performance is soft: PF ${profitFactor == null ? "n/a" : profitFactor.toFixed(2)}, PnL ${recentPnlUsdt.toFixed(2)} USDT.`, autoPauseRecommended: false };
  }
  return { level: "HEALTHY", reason: `Performance guard OK: PF ${profitFactor == null ? "n/a" : profitFactor.toFixed(2)}, PnL ${recentPnlUsdt.toFixed(2)} USDT.`, autoPauseRecommended: false };
}

function pullbackForwardReport(input: {
  trades: number[];
  winRate: number | null;
  profitFactor: number | null;
  recentPnlUsdt: number;
}) {
  const expected = {
    winRate: 49.45,
    profitFactor: 1.34,
    minTradesForRead: 5,
    strongTradesForRead: 20,
  };
  const tradeCount = input.trades.length;
  if (tradeCount === 0) {
    return {
      realityMatch: 0,
      level: "WAITING",
      summary: "No closed DOGE Pullback trades yet. Forward-test has not started.",
      expected,
      sampleProgress: 0,
    };
  }
  const sampleProgress = Math.min(100, (tradeCount / expected.strongTradesForRead) * 100);
  const winRateScore = input.winRate === null ? 0 : Math.max(0, 100 - Math.abs(input.winRate - expected.winRate) * 2);
  const pfScore = input.profitFactor === null ? 0 : Math.max(0, 100 - Math.abs(input.profitFactor - expected.profitFactor) * 45);
  const pnlScore = input.recentPnlUsdt >= 0 ? 100 : Math.max(0, 60 + input.recentPnlUsdt * 10);
  const samplePenalty = tradeCount < expected.minTradesForRead ? 35 : tradeCount < expected.strongTradesForRead ? 10 : 0;
  const realityMatch = Math.round(Math.max(0, Math.min(100, winRateScore * 0.35 + pfScore * 0.45 + pnlScore * 0.2 - samplePenalty)));
  const level = tradeCount < expected.minTradesForRead
    ? "LEARNING"
    : realityMatch >= 75
      ? "MATCHING"
      : realityMatch >= 55
        ? "WATCH"
        : "DIVERGING";
  return {
    realityMatch,
    level,
    summary: forwardSummary(level, tradeCount, input.winRate, input.profitFactor, input.recentPnlUsdt),
    expected,
    sampleProgress,
  };
}

function forwardSummary(level: string, tradeCount: number, winRate: number | null, profitFactor: number | null, pnl: number): string {
  const stats = `${tradeCount} closed trades | WR ${winRate === null ? "n/a" : `${winRate.toFixed(1)}%`} | PF ${profitFactor === null ? "n/a" : profitFactor.toFixed(2)} | PnL ${pnl.toFixed(2)} USDT`;
  if (level === "LEARNING") return `Learning sample: ${stats}. Need more trades before judging reality match.`;
  if (level === "MATCHING") return `Forward-test is matching the backtest: ${stats}.`;
  if (level === "WATCH") return `Forward-test is acceptable but not perfect: ${stats}. Keep paper only.`;
  return `Forward-test is diverging from backtest: ${stats}. Do not scale this strategy.`;
}

function pullbackReason(input: {
  candles: number;
  latestClose: number | null;
  fast: number | null;
  slow: number | null;
  rsi: number | null;
  rsiLongBelow: number;
  rsiShortAbove: number;
  tradesToday: number;
  maxDailyTrades: number;
  openTrade: boolean;
  direction: string;
}): string {
  if (input.openTrade) return "Pullback trade is already open.";
  if (input.tradesToday >= input.maxDailyTrades) return `Daily cap reached (${input.tradesToday}/${input.maxDailyTrades}).`;
  if (input.candles < 120) return `Warming DOGE 4H data (${input.candles}/120 candles).`;
  if (input.fast === null || input.slow === null || input.rsi === null || input.latestClose === null) return "Waiting for complete EMA/RSI data.";
  if (input.direction === "LONG") return "Long setup ready: EMA trend is up and RSI is in pullback zone.";
  if (input.direction === "SHORT") return "Short setup ready: EMA trend is down and RSI is in pullback zone.";
  const trend = input.fast > input.slow ? "bullish" : input.fast < input.slow ? "bearish" : "flat";
  const rsiHint = input.fast > input.slow
    ? `need RSI <= ${input.rsiLongBelow.toFixed(1)}`
    : `need RSI >= ${input.rsiShortAbove.toFixed(1)}`;
  return `Waiting: 4H trend is ${trend}, RSI ${input.rsi.toFixed(1)} (${rsiHint}).`;
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildAutoTuner(entries: PublicLossBrain[]) {
  const grouped = new Map<string, PublicLossBrain[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.symbol) ?? [];
    list.push(entry);
    grouped.set(entry.symbol, list);
  }
  return [...grouped.entries()].map(([symbol, items]) => {
    const maxPenalty = Math.max(0, ...items.map((item) => item.suggestedScorePenalty ?? inferredPenalty(item.severity)));
    const maxCooldown = Math.max(0, ...items.map((item) => item.suggestedCooldownMinutes ?? inferredCooldown(item.severity)));
    const maxSeverity = highestSeverity(items.map((item) => item.severity));
    const latest = items[0]!;
    return {
      symbol,
      lossCount24h: items.length,
      maxSeverity,
      scorePenaltyActive: maxPenalty,
      cooldownMinutesActive: maxCooldown,
      lastCategory: latest.primaryCategory,
      lastReason: latest.closeReason,
      lastPnlUsdt: latest.pnlUsdt,
      lastPnlPct: latest.pnlPct,
      mode: maxSeverity === "HIGH" ? "DEFENSIVE" : maxSeverity === "MEDIUM" ? "CAUTIOUS" : "WATCH",
      recommendation: tunerRecommendation(maxSeverity, maxPenalty, maxCooldown),
      updatedAt: latest.createdAt,
    };
  }).sort((left, right) => {
    const order = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 } as Record<string, number>;
    return (order[right.maxSeverity ?? "UNKNOWN"] ?? 0) - (order[left.maxSeverity ?? "UNKNOWN"] ?? 0);
  });
}

function inferredPenalty(severity: string | null): number {
  if (severity === "HIGH") return 8;
  if (severity === "MEDIUM") return 5;
  if (severity === "LOW") return 2;
  return 0;
}

function inferredCooldown(severity: string | null): number {
  if (severity === "HIGH") return 90;
  if (severity === "MEDIUM") return 45;
  if (severity === "LOW") return 20;
  return 0;
}

function highestSeverity(values: Array<string | null>): string {
  if (values.includes("HIGH")) return "HIGH";
  if (values.includes("MEDIUM")) return "MEDIUM";
  if (values.includes("LOW")) return "LOW";
  return "UNKNOWN";
}

function tunerRecommendation(severity: string, penalty: number, cooldown: number): string {
  if (severity === "HIGH") return `Defensive mode: require +${penalty} score and keep ${cooldown}m symbol cooldown after comparable losses.`;
  if (severity === "MEDIUM") return `Cautious mode: require +${penalty} score and wait ${cooldown}m before similar re-entry.`;
  if (severity === "LOW") return `Watch mode: small +${penalty} score guard active.`;
  return "No active loss-based adjustment.";
}

function ema(values: number[], period: number): number[] {
  const smoothing = 2 / (period + 1);
  const result: number[] = [];
  let current = values[0] ?? 0;
  for (const value of values) {
    current = value * smoothing + current * (1 - smoothing);
    result.push(current);
  }
  return result;
}

function rsi(values: number[]): number {
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < values.length; index++) {
    const delta = values[index]! - values[index - 1]!;
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function averageTrueRange(candles: Array<{ high: number; low: number; close: number }>): number {
  if (candles.length < 2) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const previous = candles[index]!;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
  });
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function intervalMs(timeframe: string): number {
  if (timeframe === "240") return 4 * 60 * 60_000;
  if (timeframe === "60") return 60 * 60_000;
  return Math.max(1, Number(timeframe)) * 60_000;
}

function inferredSeverity(pnlPct: number | null): string | null {
  if (pnlPct === null) return null;
  if (pnlPct <= -3) return "HIGH";
  if (pnlPct <= -1.5) return "MEDIUM";
  if (pnlPct < 0) return "LOW";
  return null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function riskReason(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const decision = (data as Record<string, unknown>).decision;
  if (!decision || typeof decision !== "object") return null;
  const reason = (decision as Record<string, unknown>).reason;
  return typeof reason === "string" ? reason : null;
}
