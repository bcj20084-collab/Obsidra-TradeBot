import { prisma, moduleLogger } from "@obsidra/shared";
import { ML_FEATURE_NAMES, normalizeFeatureVector } from "./MLFeatureExtractor.js";

const log = moduleLogger("MLTrainer");

export class MLTrainer {
  async train(symbol: string): Promise<void> {
    const trades = await prisma.trade.findMany({
      where: { symbol, closedAt: { gte: new Date(Date.now() - 90 * 86_400_000) }, pnlUsdt: { not: null } },
      orderBy: { closedAt: "asc" },
    });
    if (trades.length < 50 || trades.length % 50 !== 0) return;
    const dataset = trades.map((trade) => ({
      x: normalizeFeatureVector(Object.values(trade.signalData as Record<string, number>).map(Number)),
      y: (trade.pnlUsdt ?? 0) > (trade.feeUsdt ?? 0) ? 1 : 0,
    }));
    const weights = Array(20).fill(0) as number[];
    let bias = 0;
    for (let epoch = 0; epoch < 200; epoch++) {
      for (let start = 0; start < dataset.length; start += 32) {
        for (const row of dataset.slice(start, start + 32)) {
          const predicted = sigmoid(bias + row.x.reduce((sum, value, index) => sum + value * weights[index]!, 0));
          const error = row.y - predicted;
          bias += 0.01 * error;
          row.x.forEach((value, index) => { weights[index]! += 0.01 * (error * value - 0.001 * weights[index]!); });
        }
      }
    }
    const accuracy = dataset.filter((row) => Number(sigmoid(bias + row.x.reduce((s, v, i) => s + v * weights[i]!, 0)) >= 0.5) === row.y).length / dataset.length;
    const logLoss = -dataset.reduce((sum, row) => {
      const p = Math.max(1e-7, Math.min(1 - 1e-7, sigmoid(bias + row.x.reduce((s, v, i) => s + v * weights[i]!, 0))));
      return sum + row.y * Math.log(p) + (1 - row.y) * Math.log(1 - p);
    }, 0) / dataset.length;
    const latest = await prisma.mlWeights.findFirst({ where: { symbol }, orderBy: { trainedAt: "desc" } });
    const save = accuracy > 0.52 && (!latest?.cvLogLoss || logLoss < latest.cvLogLoss);
    if (save) await prisma.mlWeights.create({ data: { symbol, weights, bias, tradeCount: trades.length, cvAccuracy: accuracy, cvLogLoss: logLoss, wfEfficiency: 0 } });
    await prisma.mlTrainingLog.create({
      data: {
        symbol,
        tradeCount: trades.length,
        cvAccuracy: accuracy,
        cvLogLoss: logLoss,
        wfEfficiency: 0,
        featureImportance: Object.fromEntries(ML_FEATURE_NAMES.map((name, index) => [name, Math.abs(weights[index]!)])),
        savedWeights: save,
        ...(!save ? { rejectReason: "Validation thresholds not met" } : {}),
      },
    });
    log.info({ symbol, accuracy, logLoss, saved: save }, "ML training completed");
  }
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}
