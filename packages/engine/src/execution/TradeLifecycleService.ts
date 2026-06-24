import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { TradeRepository } from '../db/repositories/TradeRepository.js';
import type { RiskDecision } from '../risk/RiskEngine.js';
import type { SignalResult } from '../signals/types.js';
import { PaperSimulator } from './PaperSimulator.js';

export class TradeLifecycleService {
  constructor(
    private readonly trades = new TradeRepository(),
    private readonly paper = new PaperSimulator(),
  ) {}

  async recordIntent(signal: SignalResult, risk: RiskDecision) {
    return this.trades.create({
      bybitOrderId: env.PAPER_TRADING ? `paper-${randomUUID()}` : `local-${randomUUID()}`,
      symbol: env.TRADING_SYMBOL,
      direction: signal.direction,
      status: 'PENDING',
      stopLoss: risk.stopLossPrice,
      takeProfit: risk.takeProfitPrice,
      positionSizeUsdt: risk.positionSizeUsdt,
      leverage: risk.leverage,
      signalScore: signal.score,
      signalData: signal.indicators as Prisma.InputJsonObject,
      mlScore: Number(signal.indicators.mlScore ?? 0),
      marketRegime: String(signal.indicators.regime ?? 'NORMAL'),
    });
  }

  async markSubmitted(id: string) {
    return this.trades.updateStatus(id, 'SUBMITTED');
  }

  async markPaperFilled(id: string, signal: SignalResult, risk: RiskDecision) {
    const fill = this.paper.simulate(signal, risk);
    return this.trades.updateStatus(id, 'FILLED', {
      entryPrice: fill.fillPrice,
      feeUsdt: fill.feeUsdt,
      openedAt: fill.filledAt,
    });
  }

  async markOpen(id: string, bybitOrderId: string, entryPrice: number) {
    return this.trades.updateStatus(id, 'OPEN', { bybitOrderId, entryPrice, openedAt: new Date() });
  }
}
