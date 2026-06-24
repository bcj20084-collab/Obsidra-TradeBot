import type { Candle } from "@obsidra/shared";
import { calculateBacktestMetrics, type BacktestTrade } from "./BacktestMetrics.js";

export interface BacktestConfig {
  symbol: string;
  initialEquity: number;
  commission: number;
  slippage: number;
}

export class BacktestEngine {
  run(candles: Candle[], config: BacktestConfig) {
    const trades: BacktestTrade[] = [];
    for (let index = 55; index < candles.length - 1; index++) {
      const window = candles.slice(index - 55, index + 1);
      const price = window.at(-1)!.close;
      const slow = window.reduce((sum, candle) => sum + candle.close, 0) / window.length;
      const fast = window.slice(-21).reduce((sum, candle) => sum + candle.close, 0) / 21;
      if (Math.abs(fast - slow) / price < 0.002) continue;
      const direction = fast > slow ? "LONG" : "SHORT";
      const next = candles[index + 1]!;
      const entry = next.open * (direction === "LONG" ? 1 + config.slippage : 1 - config.slippage);
      const risk = entry * 0.01;
      const stop = direction === "LONG" ? entry - risk : entry + risk;
      const target = direction === "LONG" ? entry + risk * 2 : entry - risk * 2;
      const stopHit = direction === "LONG" ? next.low <= stop : next.high >= stop;
      const targetHit = direction === "LONG" ? next.high >= target : next.low <= target;
      const exit = stopHit ? stop : targetHit ? target : next.close;
      const gross = direction === "LONG" ? exit - entry : entry - exit;
      const notional = config.initialEquity * 0.01;
      const fees = notional * config.commission * 2;
      trades.push({ entryTime: next.openTime, exitTime: next.closeTime, direction, entry, exit, pnl: (gross / entry) * notional - fees, fees, reason: stopHit ? "SL" : targetHit ? "TP" : "END" });
      index += 4;
    }
    return calculateBacktestMetrics(config.initialEquity, trades);
  }
}
