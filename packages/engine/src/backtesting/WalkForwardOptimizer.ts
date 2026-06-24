import type { Candle } from "@obsidra/shared";
import { BacktestEngine, type BacktestConfig } from "./BacktestEngine.js";

export interface WalkForwardWindowResult {
  window: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  inSampleProfitFactor: number;
  outOfSampleProfitFactor: number;
}

export interface WalkForwardReport {
  efficiency: number;
  warning?: string;
  windows: WalkForwardWindowResult[];
}

export function walkForwardEfficiency(inSampleProfitFactors: number[], outOfSampleProfitFactors: number[]): number {
  const inSample = mean(inSampleProfitFactors);
  return inSample > 0 ? mean(outOfSampleProfitFactors) / inSample : 0;
}

export class WalkForwardOptimizer {
  private readonly engine = new BacktestEngine();

  run(candles: Candle[], config: BacktestConfig, windows = 6): WalkForwardReport {
    const ordered = [...candles].sort((a, b) => a.openTime - b.openTime);
    const size = Math.floor(ordered.length / Math.max(3, windows));
    const results: WalkForwardWindowResult[] = [];

    for (let index = 2; index < windows; index++) {
      const train = ordered.slice(0, index * size);
      const test = ordered.slice(index * size, (index + 1) * size);
      if (train.length < 100 || test.length < 50) continue;
      const inSample = this.engine.run(train, config);
      const outOfSample = this.engine.run(test, config);
      results.push({
        window: index - 1,
        trainStart: train[0]!.openTime,
        trainEnd: train.at(-1)!.closeTime,
        testStart: test[0]!.openTime,
        testEnd: test.at(-1)!.closeTime,
        inSampleProfitFactor: finiteProfitFactor(inSample.profitFactor),
        outOfSampleProfitFactor: finiteProfitFactor(outOfSample.profitFactor),
      });
    }

    const efficiency = walkForwardEfficiency(
      results.map((result) => result.inSampleProfitFactor),
      results.map((result) => result.outOfSampleProfitFactor),
    );

    return {
      efficiency,
      ...(efficiency < 0.5 ? { warning: "Walk-forward efficiency below 0.50" } : {}),
      windows: results,
    };
  }
}

function finiteProfitFactor(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, value);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
