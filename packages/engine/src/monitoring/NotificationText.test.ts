import { describe, expect, it } from 'vitest';
import { dailyReportText, riskBlockedText, tradeOpenedText } from './NotificationText.js';

const signal = { direction: 'LONG' as const, score: 82, entryPrice: 100, stopLoss: 98, takeProfit: 105, confidence: 'MEDIUM' as const, indicators: {} };
const risk = { approved: true, positionSizeUsdt: 100, leverage: 2, stopLossPrice: 98, takeProfitPrice: 105, trailingStopPct: 1.5 };

describe('NotificationText', () => {
  it('formats trade opened text', () => {
    expect(tradeOpenedText(signal, risk)).toContain('Trade opened');
    expect(tradeOpenedText(signal, risk)).toContain('Score 82');
  });

  it('formats risk blocked text', () => {
    expect(riskBlockedText('spread')).toContain('spread');
  });

  it('formats daily report text', () => {
    expect(dailyReportText({ pnl: 10, trades: 2, winRate: 50 })).toContain('PnL: 10 USDT');
  });
});
