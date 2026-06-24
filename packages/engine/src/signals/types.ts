export type Direction = 'LONG' | 'SHORT';
export type TrendBias = Direction | 'NEUTRAL';

export interface SignalResult {
  direction: Direction;
  score: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  indicators: Record<string, number | string>;
}
