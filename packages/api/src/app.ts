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
      const [state, latestTrade, latestOpenTrade, openTrades, recentTrades6h, latestLossBrain, openPositionsCount, signalsReady24h, signalsSkipped24h, riskRejected24h, riskRejectedEvents24h, latestSignalEvent, dbCheck] = await Promise.all([
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
      const publicLossBrain = latestLossBrain.map(publicLossBrainEntry);
      const lastTradeAt = latestTrade?.closedAt ?? latestTrade?.updatedAt ?? null;
      const lastTradeAgeHours = lastTradeAt ? (Date.now() - lastTradeAt.getTime()) / 3_600_000 : null;
      const pullbackControl = await buildPullbackControl(activeStrategies.find((strategy) => strategy.type === "PULLBACK"));
      response.json({
        ok: true,
        service: "obsidra-api",
        db: Boolean(dbCheck),
        botStatus: state?.status ?? "UNKNOWN",
        botReason: state?.reason ?? null,
        activeStrategies,
        pullbackControl,
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
  const nextCloseAt = latest ? new Date(Number(latest.openTime) + intervalMs(timeframe)).toISOString() : null;
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
    openTrade,
  };
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
