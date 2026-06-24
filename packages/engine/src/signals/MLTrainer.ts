import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';

export class MLTrainer {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async loadWeights() {
    const latest = await this.db.mlWeights.findFirst({ orderBy: { trainedAt: 'desc' } });
    if (!latest) return new Array(9).fill(0) as number[];
    return Array.isArray(latest.weights) ? latest.weights.map(Number).slice(0, 9) : new Array(9).fill(0);
  }

  async saveWeights(weights: number[], tradeCount: number) {
    return this.db.mlWeights.create({ data: { weights, tradeCount } });
  }

  async shouldTrain() {
    const closed = await this.db.trade.count({ where: { closedAt: { not: null }, pnlUsdt: { not: null } } });
    const latest = await this.db.mlWeights.findFirst({ orderBy: { trainedAt: 'desc' } });
    return closed >= 50 && (!latest || closed - latest.tradeCount >= 50);
  }

  async trainFromRecentTrades() {
    const trades = await this.db.trade.findMany({ where: { closedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, pnlUsdt: { not: null } }, orderBy: { closedAt: 'asc' }, take: 1000 });
    if (trades.length < 50) return null;
    const weights = await this.loadWeights();
    const learningRate = 0.01;
    for (let epoch = 0; epoch < 100; epoch++) {
      for (const trade of trades) {
        const features = this.featuresFromSignalData(trade.signalData as Record<string, unknown>);
        const y = (trade.pnlUsdt ?? 0) > 0 ? 1 : 0;
        const z = features.reduce((sum, value, i) => sum + value * (weights[i] ?? 0), 0);
        const prediction = 1 / (1 + Math.exp(-z));
        for (let i = 0; i < weights.length; i++) weights[i] = (weights[i] ?? 0) + learningRate * (y - prediction) * (features[i] ?? 0);
      }
    }
    await this.saveWeights(weights, trades.length);
    return weights;
  }

  private featuresFromSignalData(data: Record<string, unknown>) {
    const n = (key: string, fallback = 0) => Number(data[key] ?? fallback);
    return [
      n('rsi14', 50) / 100,
      n('macdHistogram', 0) / Math.max(n('atr14', 1), 1),
      0.5,
      1,
      n('adx', 0) / 100,
      Math.sin((2 * Math.PI * new Date().getUTCHours()) / 24),
      Math.cos((2 * Math.PI * new Date().getUTCHours()) / 24),
      n('fundingRate', 0) * 100,
      0.5,
    ];
  }
}
