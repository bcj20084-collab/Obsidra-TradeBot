export interface BollingerPoint {
  lower: number;
  middle: number;
  upper: number;
}

export function bollingerBands(values: number[], period = 20, deviations = 2): BollingerPoint[] {
  if (values.length < period) return [];
  return values.slice(period - 1).map((_, index) => {
    const window = values.slice(index, index + period);
    const middle = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return { lower: middle - deviations * std, middle, upper: middle + deviations * std };
  });
}
