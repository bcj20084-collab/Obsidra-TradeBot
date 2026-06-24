export const ML_FEATURE_NAMES = [
  "rsi", "macd", "bb", "volume", "adx", "ema21", "ema55", "atr", "funding",
  "hourSin", "hourCos", "mon", "tue", "wed", "thu", "fri", "sat", "sun", "winRate", "profitFactor",
] as const;

export function normalizeFeatureVector(values: number[]): number[] {
  return values.map((value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5))).slice(0, 20);
}
