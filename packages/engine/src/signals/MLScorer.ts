import { prisma } from "@obsidra/shared";
import { ML_FEATURE_NAMES, clamp01, normalizeSigned } from "./MLFeatureExtractor.js";

export interface MlFeatures {
  rsi14Norm?: number;
  macdHistogramNorm?: number;
  bbPosition?: number;
  volumeRatio?: number;
  trendStrength?: number;
  priceVsEma21?: number;
  priceVsEma55?: number;
  atrRatio?: number;
  fundingRateNorm?: number;
  hourSin?: number;
  hourCos?: number;
  dayOfWeek?: number[];
  recentWinRate?: number;
  recentProfitFactor?: number;
}

const FEATURE_COUNT = ML_FEATURE_NAMES.length;

export class MLScorer {
  private weights = Array<number>(FEATURE_COUNT).fill(0);
  private bias = 0;
  private completedTrades = 0;

  constructor(private readonly symbol = "ALL") {}

  async initialize(): Promise<void> {
    const [latest, completedTrades] = await Promise.all([
      prisma.mlWeights.findFirst({ where: { symbol: this.symbol }, orderBy: { trainedAt: "desc" } }),
      prisma.trade.count({ where: { symbol: this.symbol, closedAt: { not: null }, pnlUsdt: { not: null } } }),
    ]);
    this.completedTrades = completedTrades;
    if (latest && Array.isArray(latest.weights)) {
      const loaded = (latest.weights as number[]).slice(0, FEATURE_COUNT);
      this.weights = ML_FEATURE_NAMES.map((_, index) => Number(loaded[index] ?? 0));
      this.bias = latest.bias;
    }
  }

  score(features: MlFeatures): number {
    if (this.completedTrades < 50) return 0;
    const vector = this.vectorize(features);
    const z = this.bias + vector.reduce((sum, value, index) => sum + value * (this.weights[index] ?? 0), 0);
    const probability = 1 / (1 + Math.exp(-z));
    return Math.max(-20, Math.min(20, (probability - 0.5) * 40));
  }

  private vectorize(features: MlFeatures): number[] {
    const days = features.dayOfWeek?.slice(0, 7) ?? [];
    return [
      clamp01(features.rsi14Norm ?? 0.5),
      normalizeSigned(features.macdHistogramNorm ?? 0, -3, 3),
      clamp01(features.bbPosition ?? 0.5),
      clamp01(Math.min(3, features.volumeRatio ?? 1) / 3),
      clamp01(features.trendStrength ?? 0.5),
      normalizeSigned(features.priceVsEma21 ?? 0, -2, 2),
      normalizeSigned(features.priceVsEma55 ?? 0, -2, 2),
      clamp01(Math.min(3, features.atrRatio ?? 1) / 3),
      clamp01(features.fundingRateNorm ?? 0.5),
      clamp01(((features.hourSin ?? 0) + 1) / 2),
      clamp01(((features.hourCos ?? 0) + 1) / 2),
      clamp01(days[1] ?? 0),
      clamp01(days[2] ?? 0),
      clamp01(days[3] ?? 0),
      clamp01(days[4] ?? 0),
      clamp01(days[5] ?? 0),
      clamp01(days[6] ?? 0),
      clamp01(days[0] ?? 0),
      clamp01(features.recentWinRate ?? 0.5),
      clamp01(Math.min(3, features.recentProfitFactor ?? 1) / 3),
    ];
  }
}
