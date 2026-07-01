import { moduleLogger, operatorLog, prisma, type Candle, type SignalResult } from "@obsidra/shared";
import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
import type { StrategyDependencies } from "../StrategyFactory.js";

const log = moduleLogger("PullbackStrategy");

interface PullbackParams {
  timeframe: string;
  fastEma: number;
  slowEma: number;
  rsiLongBelow: number;
  rsiShortAbove: number;
  atrStopMultiplier: number;
  atrTakeProfitMultiplier: number;
  maxHoldCandles: number;
  maxDailyTrades: number;
}

export class PullbackStrategy extends BaseStrategy {
  private processing = false;
  private lastSignalCandleOpenTime = 0;

  constructor(config: ConstructorParameters<typeof BaseStrategy>[0], private readonly dependencies: StrategyDependencies) {
    super(config);
  }

  async onCandle(candle: OHLCVCandle): Promise<void> {
    const params = this.params();
    if (!["RUNNING", "PAPER"].includes(this.metrics.status) || !candle.confirmed || candle.interval !== params.timeframe || this.processing) return;
    if (candle.openTime <= this.lastSignalCandleOpenTime) return;
    this.processing = true;
    try {
      const candles = this.dependencies.storeFor(this.config.exchange).getCandles(this.config.symbol, params.timeframe, Math.max(params.slowEma + 40, 160));
      const signal = this.evaluate(candles, params);
      this.lastSignalCandleOpenTime = candle.openTime;
      if (!signal) return;
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const [dailyTrades, recentClosed] = await Promise.all([
        prisma.trade.count({ where: { strategyId: this.config.id, createdAt: { gte: day } } }),
        prisma.trade.findMany({
          where: { strategyId: this.config.id, status: "CLOSED" },
          orderBy: { closedAt: "desc" },
          take: 20,
          select: { pnlUsdt: true },
        }),
      ]);
      if (dailyTrades >= params.maxDailyTrades) {
        operatorLog("INFO", `PULLBACK WAIT | ${this.config.symbol}`, `Daily cap reached: ${dailyTrades}/${params.maxDailyTrades}`);
        return;
      }
      const circuitBreaker = pullbackCircuitBreaker(recentClosed.map((trade) => trade.pnlUsdt ?? 0));
      if (circuitBreaker.pause) {
        this.pause();
        log.warn({ strategyId: this.config.id, symbol: this.config.symbol, reason: circuitBreaker.reason }, "pullback circuit breaker opened");
        operatorLog("WARNING", `PULLBACK PAUSED | ${this.config.symbol}`, circuitBreaker.reason);
        return;
      }

      const riskEngine = this.dependencies.riskForSymbol(this.config.symbol, this.config.exchange);
      if (!riskEngine) {
        log.warn({ strategyId: this.config.id, symbol: this.config.symbol }, "pullback skipped because no risk engine is configured");
        return;
      }
      const risk = await riskEngine.approve(this.config.symbol, signal);
      if (!risk.approved) {
        operatorLog("WARNING", `PULLBACK RISK BLOCKED | ${this.config.symbol}`, risk.reason ?? "Risk engine rejected setup");
        return;
      }
      const portfolioApproval = await this.dependencies.approveOrder(this.config, signal.direction, risk.positionSizeUsdt);
      if (!portfolioApproval.approved) {
        operatorLog("WARNING", `PULLBACK BLOCKED | ${this.config.symbol}`, portfolioApproval.reason ?? "Portfolio guard rejected trade");
        return;
      }
      await this.dependencies.notifyAlert?.(
        `SIGNAL READY | ${this.config.symbol}`,
        [
          `Strategy: DOGE 4H Pullback`,
          `Direction: ${signal.direction}`,
          `Score: ${signal.score}/100`,
          `RSI: ${Number(signal.indicators.rsi ?? 0).toFixed(1)}`,
          `Entry: $${signal.entryPrice.toFixed(6)}`,
          `SL: $${signal.stopLoss.toFixed(6)}`,
          `TP: $${signal.takeProfit.toFixed(6)}`,
          `Size: ${risk.positionSizeUsdt.toFixed(2)} USDT`,
        ].join(" | "),
        `pullback-valid-signal:${this.config.symbol}:${candle.openTime}:${signal.direction}`,
      );
      const tradeId = await this.dependencies.orderManager.execute(this.config.symbol, signal, risk, this.config.exchange, this.config.id);
      this.dependencies.registerOpen(this.config, signal.direction, risk.positionSizeUsdt);
      void this.dependencies.watchTradeClose?.(tradeId, this.config.exchange, this.config.symbol, this.config.id);
      await this.dependencies.notifyTradeOpened?.(this.config.symbol, signal, risk.positionSizeUsdt, risk.leverage);
      operatorLog(
        "INFO",
        `PULLBACK TRADE | ${this.config.symbol} | ${signal.direction}`,
        `4H backtested setup | RSI ${Number(signal.indicators.rsi ?? 0).toFixed(1)} | ATR ${Number(signal.indicators.atr ?? 0).toFixed(5)} | RR ${((Math.abs(signal.takeProfit - signal.entryPrice) / Math.max(Math.abs(signal.entryPrice - signal.stopLoss), Number.EPSILON))).toFixed(2)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  private evaluate(candles: Candle[], params: PullbackParams): SignalResult | null {
    if (candles.length < params.slowEma + 20) return null;
    const latest = candles.at(-1)!;
    const closes = candles.map((item) => item.close);
    const fast = ema(closes, params.fastEma).at(-1)!;
    const slow = ema(closes, params.slowEma).at(-1)!;
    const currentRsi = rsi(closes.slice(-15));
    const currentAtr = averageTrueRange(candles.slice(-15));
    if (!Number.isFinite(currentAtr) || currentAtr <= 0 || currentAtr / latest.close > 0.08) return null;

    const longSetup = fast > slow && currentRsi <= params.rsiLongBelow && latest.close > slow;
    const shortSetup = fast < slow && currentRsi >= params.rsiShortAbove && latest.close < slow;
    if (!longSetup && !shortSetup) return null;

    const direction = longSetup ? "LONG" : "SHORT";
    const entryPrice = latest.close;
    const stopDistance = currentAtr * params.atrStopMultiplier;
    const targetDistance = currentAtr * params.atrTakeProfitMultiplier;
    const stopLoss = direction === "LONG" ? entryPrice - stopDistance : entryPrice + stopDistance;
    const takeProfit = direction === "LONG" ? entryPrice + targetDistance : entryPrice - targetDistance;
    const trendDistancePct = Math.abs(fast - slow) / Math.max(entryPrice, Number.EPSILON);
    const score = Math.round(Math.max(70, Math.min(92, 72 + trendDistancePct * 600 + Math.abs(currentRsi - 50) * 0.25)));

    return {
      symbol: this.config.symbol,
      direction,
      score,
      entryPrice,
      stopLoss,
      takeProfit,
      confidence: Math.min(0.92, score / 100),
      indicators: {
        emaFast: fast,
        emaSlow: slow,
        rsi: currentRsi,
        atr: currentAtr,
        atrStopMultiplier: params.atrStopMultiplier,
        atrTakeProfitMultiplier: params.atrTakeProfitMultiplier,
        maxHoldCandles: params.maxHoldCandles,
        timeframeMinutes: timeframeMinutes(params.timeframe),
      },
      mlAdjustment: 0,
      regime: "TRENDING",
      trendScore: Math.round(Math.min(100, trendDistancePct * 10_000)),
      entryScore: score,
      timestamp: Date.now(),
    };
  }

  private params(): PullbackParams {
    return {
      timeframe: String(this.config.params.timeframe ?? "240"),
      fastEma: Number(this.config.params.fastEma ?? 21),
      slowEma: Number(this.config.params.slowEma ?? 89),
      rsiLongBelow: Number(this.config.params.rsiLongBelow ?? 35),
      rsiShortAbove: Number(this.config.params.rsiShortAbove ?? 55),
      atrStopMultiplier: Number(this.config.params.atrStopMultiplier ?? 1.2),
      atrTakeProfitMultiplier: Number(this.config.params.atrTakeProfitMultiplier ?? 1.8),
      maxHoldCandles: Number(this.config.params.maxHoldCandles ?? 72),
      maxDailyTrades: Number(this.config.params.maxDailyTrades ?? 4),
    };
  }
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

function averageTrueRange(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const previous = candles[index]!;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
  });
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function timeframeMinutes(timeframe: string): number {
  if (timeframe === "240") return 240;
  if (timeframe === "60") return 60;
  return Math.max(1, Number(timeframe));
}

function pullbackCircuitBreaker(pnls: number[]): { pause: boolean; reason: string } {
  const newestFirst = pnls.filter((value) => Number.isFinite(value));
  const lossStreak = newestFirst.findIndex((pnl) => pnl >= 0);
  const consecutiveLosses = lossStreak === -1 ? newestFirst.length : lossStreak;
  if (consecutiveLosses >= 3) {
    return { pause: true, reason: `Three closed DOGE pullback losses in a row (${consecutiveLosses}). Strategy paused for safety.` };
  }
  if (newestFirst.length >= 10) {
    const wins = newestFirst.filter((pnl) => pnl > 0);
    const losses = newestFirst.filter((pnl) => pnl < 0);
    const grossWins = wins.reduce((sum, pnl) => sum + pnl, 0);
    const grossLosses = Math.abs(losses.reduce((sum, pnl) => sum + pnl, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 10 : 0;
    const totalPnl = newestFirst.reduce((sum, pnl) => sum + pnl, 0);
    if (profitFactor < 0.9 && totalPnl < 0) {
      return { pause: true, reason: `DOGE pullback PF ${profitFactor.toFixed(2)} with ${totalPnl.toFixed(2)} USDT recent PnL. Strategy paused for review.` };
    }
  }
  return { pause: false, reason: "DOGE pullback performance is acceptable." };
}
