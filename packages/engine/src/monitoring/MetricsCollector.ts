import type { AdaptiveConfig } from '../signals/AdaptiveParams.js';

export interface LiveMetrics { totalPnlUsdt: number; totalPnlPct: number; winRate: number; profitFactor: number; sharpeRatio: number; sortinoRatio: number; maxDrawdown: number; currentDrawdown: number; totalTrades: number; tradesLast24h: number; avgHoldTimeMinutes: number; avgWinUsdt: number; avgLossUsdt: number; avgSlippage: number; totalFeesPaidUsdt: number; signalsGenerated24h: number; signalsRejected24h: number; uptime: number; lastTradeAt: Date | null; botStatus: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR'; marketRegime: string; adaptiveConfig: AdaptiveConfig; equityCurve: { date: string; equity: number }[]; }

export class MetricsCollector {
  private started = Date.now();
  snapshot(): LiveMetrics {
    return { totalPnlUsdt: 0, totalPnlPct: 0, winRate: 0, profitFactor: 0, sharpeRatio: 0, sortinoRatio: 0, maxDrawdown: 0, currentDrawdown: 0, totalTrades: 0, tradesLast24h: 0, avgHoldTimeMinutes: 0, avgWinUsdt: 0, avgLossUsdt: 0, avgSlippage: 0, totalFeesPaidUsdt: 0, signalsGenerated24h: 0, signalsRejected24h: 0, uptime: Math.floor((Date.now() - this.started) / 1000), lastTradeAt: null, botStatus: 'RUNNING', marketRegime: 'NORMAL', adaptiveConfig: { minSignalScore: 65, slMultiplier: 1.5, tpMultiplier: 2.5, maxPositionPct: 2, leverageMax: 5, trailingStopPct: 1.5 }, equityCurve: [] };
  }
}
