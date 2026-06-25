import { prisma, moduleLogger } from "@obsidra/shared";
import { ML_FEATURE_NAMES, vectorFromRecord } from "./MLFeatureExtractor.js";
import { walkForwardEfficiency } from "../backtesting/WalkForwardOptimizer.js";
import { deterministicShuffle } from "./SeededShuffle.js";

const log = moduleLogger("MLTrainer");

interface TrainingRow {
  x: number[];
  y: number;
}

export class MLTrainer {
  async train(symbol: string): Promise<void> {
    const trades = await prisma.trade.findMany({
      where: { symbol, closedAt: { gte: new Date(Date.now() - 90 * 86_400_000) }, pnlUsdt: { not: null } },
      orderBy: { closedAt: "asc" },
    });
    if (trades.length < 50 || trades.length % 50 !== 0) return;

    const dataset: TrainingRow[] = trades.flatMap((trade) => {
      const signal = trade.signalData as Record<string, unknown>;
      const raw = (signal.mlFeatures ?? signal) as Record<string, unknown>;
      const x = vectorFromRecord(raw);
      if (x.length !== ML_FEATURE_NAMES.length) return [];
      return [{ x, y: (trade.pnlUsdt ?? 0) > (trade.feeUsdt ?? 0) ? 1 : 0 }];
    });
    if (dataset.length < 50) return;

    const trained = trainLogistic(dataset);
    const validation = crossValidate(dataset, 5);
    const latest = await prisma.mlWeights.findFirst({ where: { symbol }, orderBy: { trainedAt: "desc" } });
    const wfEfficiency = walkForwardEfficiency([validation.profitFactor], [validation.outOfSampleProfitFactor]);
    const save = validation.accuracy > 0.52 && (!latest?.cvLogLoss || validation.logLoss < latest.cvLogLoss);
    const importance = Object.fromEntries(ML_FEATURE_NAMES.map((name, index) => [name, Math.abs(trained.weights[index] ?? 0)]));

    if (save) {
      await prisma.mlWeights.create({
        data: {
          symbol,
          weights: trained.weights,
          bias: trained.bias,
          tradeCount: trades.length,
          cvAccuracy: validation.accuracy,
          cvLogLoss: validation.logLoss,
          wfEfficiency,
        },
      });
    }

    await prisma.mlTrainingLog.create({
      data: {
        symbol,
        tradeCount: trades.length,
        cvAccuracy: validation.accuracy,
        cvLogLoss: validation.logLoss,
        wfEfficiency,
        featureImportance: importance,
        savedWeights: save,
        ...(!save ? { rejectReason: "Validation thresholds not met" } : {}),
      },
    });
    log.info({ symbol, accuracy: validation.accuracy, logLoss: validation.logLoss, saved: save }, "ML training completed");
  }
}

function trainLogistic(dataset: TrainingRow[]) {
  const weights = Array(ML_FEATURE_NAMES.length).fill(0) as number[];
  let bias = 0;
  for (let epoch = 0; epoch < 200; epoch++) {
    const shuffled = deterministicShuffle(dataset, epoch);
    for (let start = 0; start < shuffled.length; start += 32) {
      for (const row of shuffled.slice(start, start + 32)) {
        const predicted = sigmoid(bias + row.x.reduce((sum, value, index) => sum + value * weights[index]!, 0));
        const error = row.y - predicted;
        bias += 0.01 * error;
        row.x.forEach((value, index) => { weights[index]! += 0.01 * (error * value - 0.001 * weights[index]!); });
      }
    }
  }
  return { weights, bias };
}

function crossValidate(dataset: TrainingRow[], folds: number) {
  const foldSize = Math.max(1, Math.floor(dataset.length / folds));
  const scores = [] as Array<{ accuracy: number; logLoss: number; profitFactor: number }>;
  for (let fold = 0; fold < folds; fold++) {
    const start = fold * foldSize;
    const end = fold === folds - 1 ? dataset.length : start + foldSize;
    const test = dataset.slice(start, end);
    const train = [...dataset.slice(0, start), ...dataset.slice(end)];
    if (!test.length || !train.length) continue;
    const model = trainLogistic(train);
    let correct = 0;
    let logLoss = 0;
    let wins = 0;
    let losses = 0;
    for (const row of test) {
      const probability = sigmoid(model.bias + row.x.reduce((sum, value, index) => sum + value * model.weights[index]!, 0));
      if (Number(probability >= 0.5) === row.y) correct += 1;
      const p = Math.max(1e-7, Math.min(1 - 1e-7, probability));
      logLoss += -(row.y * Math.log(p) + (1 - row.y) * Math.log(1 - p));
      if (row.y === 1) wins += p;
      else losses += 1 - p;
    }
    scores.push({ accuracy: correct / test.length, logLoss: logLoss / test.length, profitFactor: losses > 0 ? wins / losses : wins });
  }
  return {
    accuracy: mean(scores.map((score) => score.accuracy)),
    logLoss: mean(scores.map((score) => score.logLoss)),
    profitFactor: mean(scores.map((score) => score.profitFactor)),
    outOfSampleProfitFactor: mean(scores.slice(-1).map((score) => score.profitFactor)),
  };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}
