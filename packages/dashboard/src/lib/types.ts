export interface Metrics {
  totalPnlUsdt: number;
  totalPnlPct: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
  tradesLast24h: number;
  totalTrades: number;
  totalFeesPaidUsdt: number;
  botStatus: "RUNNING" | "PAUSED" | "STOPPED" | "ERROR";
  marketRegime: string;
  equityCurve: Array<{ date: string; equity: number }>;
  adaptiveConfig: Record<string, number>;
}

export interface Trade {
  id: string;
  createdAt: string;
  symbol: string;
  exchange: string;
  strategyId: string;
  direction: string;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  pnlUsdt: number | null;
  feeUsdt: number | null;
  slippage: number | null;
  signalScore: number;
  holdTimeSeconds: number | null;
  status: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}
