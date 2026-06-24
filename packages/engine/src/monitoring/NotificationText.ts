import type { RiskDecision } from '../risk/RiskEngine.js';
import type { SignalResult } from '../signals/types.js';

export function tradeOpenedText(signal: SignalResult, risk: RiskDecision) {
  return [
    'Trade opened',
    `${signal.direction} ${signal.entryPrice}`,
    `SL ${risk.stopLossPrice}`,
    `TP ${risk.takeProfitPrice}`,
    `Score ${signal.score}`,
  ].join('\n');
}

export function riskBlockedText(reason: string) {
  return `Risk blocked: ${reason}`;
}

export function dailyReportText(input: { pnl: number; trades: number; winRate: number }) {
  return [`Daily report`, `PnL: ${input.pnl} USDT`, `Trades: ${input.trades}`, `Win rate: ${input.winRate}%`].join('\n');
}
