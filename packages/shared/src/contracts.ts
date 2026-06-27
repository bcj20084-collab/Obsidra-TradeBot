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
  symbol?: string;
  direction: Direction;
  score: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  indicators: Record<string, number>;
  mlFeatures?: Record<string, number>;
  mlAdjustment: number;
  regime: MarketRegime;
  trendScore?: number;
  entryScore?: number;
  timestamp?: number;
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
  perSymbolRegimes?: Array<{ symbol: string; regime: MarketRegime; config: AdaptiveConfig }>;
  equityCurve: Array<{ date: string; equity: number }>;
  symbols?: Record<string, { pnl: number; trades: number; winRate: number; openPosition: boolean }>;
  totalExposureUsdt?: number;
  openPositionsCount?: number;
  mlAccuracy?: number | null;
  safetySupervisor?: {
    level: "OK" | "WATCH" | "DANGER";
    score: number;
    summary: string;
    checks: Array<{ name: string; status: "PASS" | "WATCH" | "FAIL"; detail: string }>;
    updatedAt: string;
  };
}
