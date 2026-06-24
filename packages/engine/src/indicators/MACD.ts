import { ema } from "./EMA.js";

export interface MacdPoint {
  macd: number;
  signal: number;
  histogram: number;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  const fastValues = ema(values, fast);
  const slowValues = ema(values, slow);
  if (!fastValues.length || !slowValues.length) return [];
  const offset = slow - fast;
  const line = slowValues.map((slowValue, index) => fastValues[index + offset]! - slowValue);
  const signalValues = ema(line, signalPeriod);
  return signalValues.map((signal, index) => {
    const macdValue = line[index + signalPeriod - 1]!;
    return { macd: macdValue, signal, histogram: macdValue - signal };
  });
}
