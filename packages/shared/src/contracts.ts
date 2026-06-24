export type Direction = "LONG" | "SHORT";
export type BotStatus = "RUNNING" | "PAUSED" | "STOPPED" | "ERROR";
export type MarketRegime =
  | "NORMAL"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "TRENDING"
  | "RANGING"
  | "DRAWDOWN_MODE";

export interface Candle {
  symbol: string;
  timeframe: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  confirmed: boolean;
}

export interface AdaptiveConfig {
  minSignalScore: number;
  slMultiplier: number;
  tpMultiplier: number;
  maxPositionPct: number;
  leverageMax: number;
  trailingStopPct: number;
}

export interface SignalResult {
  direction: Direction;
  score: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  indicators: Record<string, number>;
  mlAdjustment: number;
  regime: MarketRegime;
}

export interface LiveMetrics {
  totalPnlUsdt: number;
  totalPnlPct: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  totalTrades: number;
  tradesLast24h: number;
  avgHoldTimeMinutes: number;
  avgWinUsdt: number;
  avgLossUsdt: number;
  avgSlippage: number;
  totalFeesPaidUsdt: number;
  signalsGenerated24h: number;
  signalsRejected24h: number;
  uptime: number;
  lastTradeAt: string | null;
  botStatus: BotStatus;
  marketRegime: MarketRegime;
  adaptiveConfig: AdaptiveConfig;
  equityCurve: Array<{ date: string; equity: number }>;
}
