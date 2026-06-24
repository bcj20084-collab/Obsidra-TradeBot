import { describe, expect, it } from 'vitest';
import { MLScorer, type MlFeatures } from './MLScorer.js';

const features: MlFeatures = {
  rsi14Norm: 0.5,
  macdHistogramNorm: 0.2,
  bbPosition: 0.1,
  volumeRatio: 1,
  trendStrength: 0.7,
  hourSin: 0,
  hourCos: 1,
  fundingRateNorm: 0,
  recentWinRate: 0.6,
};

describe('MLScorer', () => {
  it('returns neutral score with zero weights', () => {
    expect(new MLScorer().score(features)).toBe(0);
  });

  it('applies positive weights as positive adjustment', () => {
    const scorer = new MLScorer();
    scorer.setWeights(new Array(9).fill(1));
    expect(scorer.score(features)).toBeGreaterThan(0);
  });
});
