export function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const multiplier = 2 / (period + 1);
  const output = [values.slice(0, period).reduce((sum, value) => sum + value, 0) / period];
  for (const value of values.slice(period)) {
    output.push(value * multiplier + output[output.length - 1]! * (1 - multiplier));
  }
  return output;
}
