export const ML_FEATURE_NAMES = [
  "rsi_14_norm",
  "macd_hist_norm",
  "bb_position",
  "volume_ratio",
  "trend_strength",
  "price_vs_ema21",
  "price_vs_ema55",
  "atr_ratio",
  "funding_rate_norm",
  "hour_sin",
  "hour_cos",
  "day_mon",
  "day_tue",
  "day_wed",
  "day_thu",
  "day_fri",
  "day_sat",
  "day_sun",
  "recent_win_rate",
  "recent_pf",
] as const;

export type MLFeatureName = typeof ML_FEATURE_NAMES[number];
export type MLFeatureVector = Record<MLFeatureName, number>;

export function normalizeFeatureVector(values: number[]): number[] {
  return ML_FEATURE_NAMES.map((_, index) => clamp01(values[index] ?? 0.5));
}

export function vectorFromRecord(record: Record<string, unknown>): number[] {
  return ML_FEATURE_NAMES.map((name) => clamp01(Number(record[name] ?? 0.5)));
}

export function buildFeatureVector(input: Partial<Record<MLFeatureName, number>>): MLFeatureVector {
  return Object.fromEntries(ML_FEATURE_NAMES.map((name) => [name, clamp01(input[name] ?? 0.5)])) as MLFeatureVector;
}

export function normalizeSigned(value: number, min: number, max: number): number {
  const clipped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
  return clamp01((clipped - min) / (max - min));
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
