import type { Candle } from "@obsidra/shared";
import { ema } from "./EMA.js";

export function adx(candles: Candle[], period = 14): number[] {
  if (candles.length <= period * 2) return [];
  const tr: number[] = [];
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]!;
    const previous = candles[i - 1]!;
    tr.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
    const up = current.high - previous.high;
    const down = previous.low - current.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
  }
  const trSmooth = ema(tr, period);
  const plusSmooth = ema(plusDm, period);
  const minusSmooth = ema(minusDm, period);
  const dx = trSmooth.map((trValue, index) => {
    const plus = 100 * (plusSmooth[index] ?? 0) / Math.max(trValue, Number.EPSILON);
    const minus = 100 * (minusSmooth[index] ?? 0) / Math.max(trValue, Number.EPSILON);
    return (100 * Math.abs(plus - minus)) / Math.max(plus + minus, Number.EPSILON);
  });
  return ema(dx, period);
}
