import { z } from "zod";
import { Prisma, prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

const configSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]+$/),
  startDate: z.string(),
  endDate: z.string(),
  initialEquity: z.number().positive().default(10_000),
  commission: z.number().min(0).max(0.01).default(0.00055),
  slippage: z.number().min(0).max(0.01).default(0.0002),
  interval: z.string().default("15"),
  useMLScorer: z.boolean().default(false),
});

interface BacktestTradeRow {
  entryTime: number;
  exitTime: number;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  reason: "SL" | "TP" | "END";
}

export const backtestRouter = router({
  list: protectedProcedure.query(() => prisma.backtestResult.findMany({ orderBy: { createdAt: "desc" }, take: 10 })),
  run: protectedProcedure.input(configSchema).mutation(async ({ input }) => {
    const candles = (await prisma.historicalCandle.findMany({
      where: {
        symbol: input.symbol,
        interval: input.interval,
        openTime: { gte: BigInt(new Date(input.startDate).getTime()), lte: BigInt(new Date(input.endDate).getTime()) },
      },
      orderBy: { openTime: "asc" },
    })).map((candle) => ({
      openTime: Number(candle.openTime),
      closeTime: Number(candle.openTime) + intervalMs(input.interval),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));

    const trades: BacktestTradeRow[] = [];
    for (let index = 56; index < candles.length - 1; index++) {
      const history = candles.slice(index - 55, index + 1);
      const direction = signalDirection(history);
      if (!direction) continue;
      const next = candles[index + 1]!;
      const atr = averageTrueRange(history.slice(-15));
      if (atr <= 0 || atr / next.open > 0.03) continue;
      const entry = next.open * (direction === "LONG" ? 1 + input.slippage : 1 - input.slippage);
      const stopLoss = direction === "LONG" ? entry - atr * 1.5 : entry + atr * 1.5;
      const takeProfit = direction === "LONG" ? entry + atr * 2.5 : entry - atr * 2.5;
      const stopHit = direction === "LONG" ? next.low <= stopLoss : next.high >= stopLoss;
      const targetHit = direction === "LONG" ? next.high >= takeProfit : next.low <= takeProfit;
      const reason: "SL" | "TP" | "END" = stopHit ? "SL" : targetHit ? "TP" : "END";
      const exit = reason === "SL" ? stopLoss : reason === "TP" ? takeProfit : next.close;
      const positionSizeUsdt = input.initialEquity * 0.01;
      const gross = direction === "LONG" ? ((exit - entry) / entry) * positionSizeUsdt : ((entry - exit) / entry) * positionSizeUsdt;
      const fees = positionSizeUsdt * input.commission * 2;
      const pnl = gross - fees;
      trades.push({ entryTime: next.openTime, exitTime: next.closeTime, direction, entry, exit, pnl, pnlPct: (pnl / positionSizeUsdt) * 100, fees, reason });
      index += 4;
    }

    const metrics = calculateMetrics(input.initialEquity, trades, candles.length ? null : "Fetch historical candles before running a backtest");
    return prisma.backtestResult.create({
      data: {
        symbol: input.symbol,
        startDate: input.startDate,
        endDate: input.endDate,
        config: input,
        metrics,
        equityCurve: metrics.equityCurve,
        trades: trades as unknown as Prisma.InputJsonValue,
      },
    });
  }),
});

function signalDirection(candles: Array<{ close: number }>): "LONG" | "SHORT" | null {
  const closes = candles.map((candle) => candle.close);
  const fast = mean(closes.slice(-21));
  const slow = mean(closes.slice(-55));
  const price = closes.at(-1) ?? 0;
  if (Math.abs(fast - slow) / Math.max(price, Number.EPSILON) < 0.0025) return null;
  const currentRsi = rsi(closes.slice(-15));
  if (fast > slow && currentRsi < 65) return "LONG";
  if (fast < slow && currentRsi > 35) return "SHORT";
  return null;
}

function calculateMetrics(initialEquity: number, trades: BacktestTradeRow[], dataWarning: string | null) {
  let equity = initialEquity;
  let peak = initialEquity;
  let maxDrawdown = 0;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const equityCurve = trades.map((trade) => {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    return { date: new Date(trade.exitTime).toISOString().slice(0, 10), equity, drawdown };
  });
  const totalWins = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const totalLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const totalPnlUsdt = equity - initialEquity;
  return {
    totalTrades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 10 : 0,
    maxDrawdown,
    totalPnlUsdt,
    totalPnlPct: (totalPnlUsdt / initialEquity) * 100,
    totalFees: trades.reduce((sum, trade) => sum + trade.fees, 0),
    avgWinUsdt: wins.length ? totalWins / wins.length : 0,
    avgLossUsdt: losses.length ? losses.reduce((sum, trade) => sum + trade.pnl, 0) / losses.length : 0,
    equityCurve,
    dataWarning,
  };
}

function averageTrueRange(candles: Array<{ high: number; low: number; close: number }>): number {
  if (candles.length < 2) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const previous = candles[index]!;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
  });
  return mean(ranges);
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
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function intervalMs(interval: string): number {
  if (interval === "D") return 86_400_000;
  if (interval === "W") return 7 * 86_400_000;
  if (interval === "M") return 30 * 86_400_000;
  return Math.max(1, Number(interval)) * 60_000;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
