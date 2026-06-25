import type { IStrategy, StrategyConfig, StrategyMetrics } from "./IStrategy.js";
import type { OHLCVCandle, Position } from "../exchanges/IExchangeAdapter.js";

export abstract class BaseStrategy implements IStrategy {
  protected positions: Position[] = [];
  protected metrics: StrategyMetrics;
  constructor(public readonly config: StrategyConfig) { this.metrics = { pnlUsdt: 0, trades: 0, wins: 0, status: config.isPaperTrading ? "PAPER" : config.status }; }
  async start(): Promise<void> { this.metrics.status = this.config.isPaperTrading ? "PAPER" : "RUNNING"; }
  async stop(): Promise<void> { this.metrics.status = "STOPPED"; }
  pause(): void { this.metrics.status = "PAUSED"; }
  resume(): void { this.metrics.status = this.config.isPaperTrading ? "PAPER" : "RUNNING"; }
  abstract onCandle(candle: OHLCVCandle): Promise<void>;
  onTick(_price: number, _fundingRate: number): void {}
  getOpenPositions(): Position[] { return [...this.positions]; }
  getMetrics(): StrategyMetrics { return { ...this.metrics }; }
}
