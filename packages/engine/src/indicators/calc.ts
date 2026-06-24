import type { Candle } from '../data/MarketDataStore.js';

export const closes = (candles: Candle[]) => candles.map((c) => c.close);

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) out.push(values[i]! * k + out[i - 1]! * (1 - k));
  return out;
}

export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gains = 0, losses = 0;
  const slice = values.slice(-period - 1);
  for (let i = 1; i < slice.length; i++) { const diff = slice[i]! - slice[i - 1]!; if (diff >= 0) gains += diff; else losses += Math.abs(diff); }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = values.map((_, i) => (fastEma[i] ?? 0) - (slowEma[i] ?? 0));
  const sig = ema(line, signal);
  const histogram = (line.at(-1) ?? 0) - (sig.at(-1) ?? 0);
  const previousHistogram = (line.at(-2) ?? 0) - (sig.at(-2) ?? 0);
  return { line: line.at(-1) ?? 0, signal: sig.at(-1) ?? 0, histogram, previousHistogram };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(slice.length, 1);
  const sd = Math.sqrt(variance);
  return { lower: mean - mult * sd, middle: mean, upper: mean + mult * sd };
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!, p = candles[i - 1]!;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
}

export function adx(candles: Candle[], period = 14): number {
  if (candles.length <= period + 1) return 0;
  const recent = candles.slice(-period - 1);
  const trend = Math.abs(recent.at(-1)!.close - recent[0]!.close);
  const range = recent.reduce((sum, c) => sum + (c.high - c.low), 0);
  return Math.min(100, range === 0 ? 0 : (trend / range) * 100);
}
