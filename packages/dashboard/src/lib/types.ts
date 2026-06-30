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
  safetySupervisor?: SafetySupervisorStatus;
}

export interface SafetySupervisorStatus {
  level: "OK" | "WATCH" | "DANGER";
  score: number;
  summary: string;
  checks: Array<{ name: string; status: "PASS" | "WATCH" | "FAIL"; detail: string }>;
  updatedAt: string;
}

export interface DeepHealth {
  ok: boolean;
  service: string;
  db: boolean;
  botStatus: string;
  botReason: string | null;
  uptimeSeconds: number;
  openPositionsCount: number;
  latestTrade: { symbol: string; status: string; updatedAt: string; closedAt: string | null } | null;
  latestOpenTrade: DeepOpenTrade | null;
  lastTradeAgeHours: number | null;
  signalsReady24h: number;
  signalsSkipped24h: number;
  riskRejected24h: number;
  riskBlockedByOpenPosition24h?: number;
  actionableRiskRejected24h?: number;
  latestSignalEvent: { type: string; data: unknown; createdAt: string } | null;
  timestamp: string;
}

export interface DeepOpenTrade {
  id: string;
  symbol: string;
  exchange: string;
  executionMode: string;
  direction: string;
  status: string;
  entryPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  positionSizeUsdt: number;
  leverage: number;
  signalScore: number;
  openedAt: string | null;
  updatedAt: string;
  protection: PaperProtection | null;
}

export interface PaperProtection {
  tp1Hit: boolean;
  tp2Hit: boolean;
  breakevenMoved: boolean;
  trailingActivated: boolean;
  partialRealizedPnlUsdt: number | null;
  partialFeeUsdt: number | null;
  initialPositionSizeUsdt: number | null;
  initialStopLoss: number | null;
  highestPrice: number | null;
  lowestPrice: number | null;
  currentPrice: number | null;
  unrealizedPnlUsdt: number | null;
  profitR: number | null;
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

export interface ReplayCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketScanItem {
  exchange: string;
  symbol: string;
  score: number;
  direction: string;
  price: number;
  volumeRatio: number;
  volatilityPct: number;
  trendPct: number;
  reason: string;
  candleCount15m: number;
  candleCount4h: number;
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
