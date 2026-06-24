import type { Candle } from "@obsidra/shared";

export function atr(candles: Candle[], period = 14): number[] {
  if (candles.length <= period) return [];
  const tr = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index]!.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  let current = tr.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const output = [current];
  for (const value of tr.slice(period)) {
    current = (current * (period - 1) + value) / period;
    output.push(current);
  }
  return output;
}
