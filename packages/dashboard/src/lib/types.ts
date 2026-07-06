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
  deploy?: {
    nodeEnv: string;
    railwayEnvironmentName: string | null;
    railwayServiceName: string | null;
    railwayReplicaRegion: string | null;
    railwayPublicDomain: string | null;
    railwayStaticUrl: string | null;
    deploymentId: string | null;
    projectId: string | null;
    serviceId: string | null;
    commitSha: string | null;
    commitBranch: string | null;
    startedAt: string;
  };
  botStatus: string;
  botReason: string | null;
  activeStrategies?: Array<{
    id: string;
    type: string;
    exchange: string;
    symbol: string;
    mode: string;
    params: Record<string, unknown>;
  }>;
  pullbackControl?: PullbackControl | null;
  noTradeDiagnostics?: NoTradeDiagnostics | null;
  uptimeSeconds: number;
  openPositionsCount: number;
  latestTrade: { symbol: string; status: string; updatedAt: string; closedAt: string | null } | null;
  latestOpenTrade: DeepOpenTrade | null;
  openTrades?: DeepOpenTrade[];
  recentTrades6h?: Array<DeepOpenTrade & {
    exitPrice: number | null;
    pnlUsdt: number | null;
    pnlPct: number | null;
    closeReason: string | null;
    closedAt: string | null;
  }>;
  recentClosedTrades6h?: number;
  latestLossBrain?: LossBrainItem[];
  autoTuner?: AutoTunerItem[];
  lastTradeAgeHours: number | null;
  signalsReady24h: number;
  signalsSkipped24h: number;
  riskRejected24h: number;
  riskBlockedByOpenPosition24h?: number;
  actionableRiskRejected24h?: number;
  latestSignalEvent: { type: string; data: unknown; createdAt: string } | null;
  timestamp: string;
}

export interface NoTradeDiagnostics {
  summary: string;
  generatedAt: string;
  signalsReady24h: number;
  signalsSkipped24h: number;
  lastTradeAgeHours: number | null;
  items: NoTradeDiagnosticItem[];
}

export interface NoTradeDiagnosticItem {
  strategyId: string;
  type: string;
  exchange: string;
  symbol: string;
  mode: string;
  status: "READY" | "WAITING" | "COOLING_DOWN" | "PROTECTED" | "MANAGING" | "PAUSED" | "FILTERED" | "SCANNING" | string;
  reason: string;
  nextAction: string;
  latestSignal: {
    type: string;
    createdAt: string;
    ageMinutes: number;
    reason: string;
  } | null;
  lossStreak: number;
  lastClosedTrade: {
    pnlUsdt: number | null;
    pnlPct: number | null;
    closeReason: string | null;
    closedAt: string | null;
  } | null;
  checklist?: Array<{ name: string; passed: boolean; detail: string }>;
  edgeScore?: number;
  nextCheckAt?: string | null;
  healthLevel?: string;
  healthReason?: string;
  blockedUntil?: string | null;
  remainingCooldownMinutes?: number | null;
}

export interface LossBrainItem {
  id: string;
  createdAt: string;
  symbol: string;
  direction: string;
  status: string;
  pnlUsdt: number | null;
  pnlPct: number | null;
  closeReason: string | null;
  primaryCategory: string | null;
  severity: string | null;
  confidence: number | null;
  summary: string | null;
  suggestedScorePenalty: number | null;
  suggestedCooldownMinutes: number | null;
  recommendations: string[];
  adaptiveActions: unknown[];
}

export interface AutoTunerItem {
  symbol: string;
  lossCount24h: number;
  maxSeverity: string;
  scorePenaltyActive: number;
  cooldownMinutesActive: number;
  lastCategory: string | null;
  lastReason: string | null;
  lastPnlUsdt: number | null;
  lastPnlPct: number | null;
  mode: string;
  recommendation: string;
  updatedAt: string;
}

export interface PullbackControl {
  strategyId: string;
  symbol: string;
  exchange: string;
  mode: string;
  timeframe: string;
  status: string;
  direction: string;
  reason: string;
  candleCount: number;
  latestCandleAt: string | null;
  nextCandleCloseAt: string | null;
  price: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  rsi: number | null;
  atr: number | null;
  atrPct: number | null;
  trendPct: number | null;
  edgeScore: number;
  riskRewardPreview: number | null;
  checklist: Array<{ name: string; passed: boolean; detail: string }>;
  stopLossPreview: number | null;
  takeProfitPreview: number | null;
  tradesToday: number;
  maxDailyTrades: number;
  maxHoldCandles: number;
  maxHoldHours: number;
  recentTrades: number;
  winRate: number | null;
  profitFactor: number | null;
  recentPnlUsdt: number;
  healthLevel: "LEARNING" | "HEALTHY" | "WATCH" | "DANGER";
  healthReason: string;
  autoPauseRecommended: boolean;
  lastClosedTrade: {
    pnlUsdt: number | null;
    pnlPct: number | null;
    closeReason: string | null;
    closedAt: string | null;
  } | null;
  forwardReport: {
    realityMatch: number;
    level: "WAITING" | "LEARNING" | "MATCHING" | "WATCH" | "DIVERGING";
    summary: string;
    expected: {
      winRate: number;
      profitFactor: number;
      minTradesForRead: number;
      strongTradesForRead: number;
    };
    sampleProgress: number;
  };
  openTrade: {
    id: string;
    direction: string;
    entryPrice: number | null;
    stopLoss: number;
    takeProfit: number;
    openedAt: string | null;
    signalScore: number;
  } | null;
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
  dangerAlerted: boolean;
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
