export interface MlFeatures { rsi14Norm: number; macdHistogramNorm: number; bbPosition: number; volumeRatio: number; trendStrength: number; hourSin: number; hourCos: number; fundingRateNorm: number; recentWinRate: number; }

export class MLScorer {
  private weights: number[] = new Array(9).fill(0);
  setWeights(weights: number[]) { this.weights = weights.slice(0, 9); }
  score(features: MlFeatures) {
    const x = [features.rsi14Norm, features.macdHistogramNorm, features.bbPosition, features.volumeRatio, features.trendStrength, features.hourSin, features.hourCos, features.fundingRateNorm, features.recentWinRate];
    const z = x.reduce((sum, value, i) => sum + value * (this.weights[i] ?? 0), 0);
    const probability = 1 / (1 + Math.exp(-z));
    return Math.round((probability - 0.5) * 40);
  }
}
