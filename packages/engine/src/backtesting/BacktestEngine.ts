import type { Candle, Direction } from "@obsidra/shared";
import { calculateBacktestMetrics, type BacktestResult, type BacktestTrade } from "./BacktestMetrics.js";
import { BacktestExecutor } from "./BacktestExecutor.js";

export interface BacktestConfig {
  symbol?: string;
  symbols?: string[];
  startDate?: string;
  endDate?: string;
  interval?: string;
  initialEquity: number;
  commission: number;
  slippage: number;
  useMLScorer?: boolean;
}

interface OpenPosition {
  symbol: string;
  direction: Direction;
  entryTime: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  positionSizeUsdt: number;
  leverage: number;
  commission: number;
  slippage: number;
}

export class BacktestEngine {
  private readonly executor = new BacktestExecutor();

  run(candles: Candle[], config: BacktestConfig): BacktestResult {
    const symbols = config.symbols?.length ? config.symbols : [config.symbol ?? candles[0]?.symbol ?? "UNKNOWN"];
    const normalized = candles
      .filter((candle) => symbols.includes(candle.symbol))
      .sort((a, b) => a.openTime - b.openTime);
    const trades: BacktestTrade[] = [];
    const openBySymbol = new Map<string, OpenPosition>();

    for (let index = 56; index < normalized.length; index++) {
      const candle = normalized[index]!;
      const open = openBySymbol.get(candle.symbol);
      if (open) {
        const fill = this.executor.closeOnCandle(open, candle);
        if (fill) {
          trades.push(fill);
          openBySymbol.delete(candle.symbol);
        }
        continue;
      }

      // Only completed candles may influence a decision executed at this candle's open.
      const history = normalized.filter((row) => row.symbol === candle.symbol && row.openTime < candle.openTime).slice(-56);
      if (history.length < 56) continue;
      const signal = this.simpleSignal(history);
      if (!signal) continue;

      const atr = averageTrueRange(history.slice(-15));
      if (atr <= 0 || atr / candle.close >= 0.03) continue;
      const riskDistance = atr * 1.5;
      const rewardDistance = atr * 2.5;
      const stopLoss = signal === "LONG" ? candle.open - riskDistance : candle.open + riskDistance;
      const takeProfit = signal === "LONG" ? candle.open + rewardDistance : candle.open - rewardDistance;
      const riskRewardRatio = rewardDistance / Math.max(riskDistance, Number.EPSILON);
      if (riskRewardRatio < 1.5) continue;

      const position = this.executor.openMarket({
        symbol: candle.symbol,
        direction: signal,
        candle,
        stopLoss,
        takeProfit,
        positionSizeUsdt: config.initialEquity * 0.01,
        leverage: 1,
        commission: config.commission,
        slippage: config.slippage,
      });
      openBySymbol.set(candle.symbol, position);
    }

    for (const position of openBySymbol.values()) {
      const finalCandle = normalized.filter((candle) => candle.symbol === position.symbol).at(-1);
      if (!finalCandle) continue;
      const fill = this.executor.closeOnCandle(position, finalCandle, true);
      if (fill) trades.push(fill);
    }

    return calculateBacktestMetrics(config.initialEquity, trades);
  }

  private simpleSignal(candles: Candle[]): Direction | null {
    const close = candles.map((candle) => candle.close);
    const fast = mean(close.slice(-21));
    const slow = mean(close.slice(-55));
    const latest = candles.at(-1)!;
    const trendStrength = Math.abs(fast - slow) / Math.max(latest.close, Number.EPSILON);
    if (trendStrength < 0.0025) return null;
    return fast > slow ? "LONG" : "SHORT";
  }
}

function averageTrueRange(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const previous = candles[index]!;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
  });
  return mean(ranges);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
