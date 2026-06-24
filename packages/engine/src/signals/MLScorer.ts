import { prisma } from "@obsidra/shared";

export interface MlFeatures {
  rsi14Norm: number;
  macdHistogramNorm: number;
  bbPosition: number;
  volumeRatio: number;
  trendStrength: number;
  hourSin: number;
  hourCos: number;
  dayOfWeek: number[];
  fundingRateNorm: number;
  recentWinRate: number;
}

const FEATURE_COUNT = 17;

export class MLScorer {
  private weights = Array<number>(FEATURE_COUNT + 1).fill(0);

  async initialize(): Promise<void> {
    const latest = await prisma.mlWeights.findFirst({ orderBy: { trainedAt: "desc" } });
    if (latest && Array.isArray(latest.weights)) this.weights = latest.weights as number[];
  }

  score(features: MlFeatures): number {
    const vector = this.vectorize(features);
    const z = this.weights[0]! + vector.reduce((sum, value, index) => sum + value * (this.weights[index + 1] ?? 0), 0);
    const probability = 1 / (1 + Math.exp(-z));
    return Math.max(-20, Math.min(20, (probability - 0.5) * 40));
  }

  async retrain(): Promise<void> {
    const trades = await prisma.trade.findMany({
      where: { closedAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, pnlUsdt: { not: null } },
      orderBy: { closedAt: "asc" },
    });
    if (trades.length < 50 || trades.length % 50 !== 0) return;
    const learningRate = 0.01;
    for (let epoch = 0; epoch < 100; epoch++) {
      for (const trade of trades) {
        const signal = trade.signalData as Record<string, unknown>;
        const raw = signal.mlFeatures as MlFeatures | undefined;
        if (!raw) continue;
        const x = this.vectorize(raw);
        const predicted = 1 / (1 + Math.exp(-(this.weights[0]! + x.reduce((s, v, i) => s + v * (this.weights[i + 1] ?? 0), 0))));
        const error = (trade.pnlUsdt ?? 0) > 0 ? 1 - predicted : -predicted;
        this.weights[0]! += learningRate * error;
        x.forEach((value, index) => (this.weights[index + 1]! += learningRate * error * value));
      }
    }
    await prisma.mlWeights.create({ data: { weights: this.weights, tradeCount: trades.length } });
  }

  private vectorize(features: MlFeatures): number[] {
    return [
      features.rsi14Norm,
      features.macdHistogramNorm,
      features.bbPosition,
      Math.min(2, features.volumeRatio) / 2,
      features.trendStrength,
      features.hourSin,
      features.hourCos,
      ...features.dayOfWeek.slice(0, 7),
      features.fundingRateNorm,
      features.recentWinRate,
    ];
  }
}
