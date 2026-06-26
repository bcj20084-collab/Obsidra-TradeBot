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
  signalsGenerated24h?: number;
  signalsRejected24h?: number;
  totalExposureUsdt?: number;
  openPositionsCount?: number;
  mlAccuracy?: number | null;
  botStatus: "RUNNING" | "PAUSED" | "STOPPED" | "ERROR";
  marketRegime: string;
  equityCurve: Array<{ date: string; equity: number }>;
  adaptiveConfig: Record<string, number>;
  perSymbolRegimes?: Array<{ symbol: string; regime: string; config: Record<string, number> }>;
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
  executionMode?: string;
  pnlPct?: number | null;
  closeReason?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  signalData?: Record<string, unknown>;
  marketRegime?: string | null;
  mlScore?: number | null;
}

export interface TradeTransition {
  id: string;
  fromState: string | null;
  toState: string;
  reason: string;
  data: unknown;
  createdAt: string;
}

export interface TradeJournalEntry {
  id: string;
  type: string;
  data: unknown;
  createdAt: string;
}

export interface TradeDetail extends Trade {
  transitions: TradeTransition[];
  journalEntries: TradeJournalEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface SignalFeedItem {
  id: string;
  type: string;
  createdAt: string;
  symbol: string;
  exchange: string;
  direction: string;
  status: string | null;
  score: number | null;
  confidence: number | null;
  reason: string;
  price: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  regime: string;
  details: Record<string, unknown>;
}
