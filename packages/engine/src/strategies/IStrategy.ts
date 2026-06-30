import type { OHLCVCandle, Position, ExchangeId } from "../exchanges/IExchangeAdapter.js";

export type StrategyType = "TREND" | "PULLBACK" | "GRID" | "DCA" | "SCALP" | "COPY";
export type StrategyStatus = "RUNNING" | "PAUSED" | "PAPER" | "STOPPED" | "ERROR";
export interface StrategyConfig {
  id: string; type: StrategyType; exchange: ExchangeId; symbol: string; status: StrategyStatus;
  maxPositionUsdt: number; dailyLossLimit: number; maxDrawdownPct: number;
  isPaperTrading: boolean; params: Record<string, unknown>;
}
export interface StrategyMetrics { pnlUsdt: number; trades: number; wins: number; status: StrategyStatus }
export interface IStrategy {
  readonly config: StrategyConfig;
  start(): Promise<void>; stop(): Promise<void>; pause(): void; resume(): void;
  onCandle(candle: OHLCVCandle): Promise<void>; onTick(price: number, fundingRate: number): void;
  getOpenPositions(): Position[]; getMetrics(): StrategyMetrics;
}
