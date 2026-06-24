export function walkForwardEfficiency(inSampleProfitFactors: number[], outOfSampleProfitFactors: number[]): number {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const inSample = mean(inSampleProfitFactors);
  return inSample > 0 ? mean(outOfSampleProfitFactors) / inSample : 0;
}
