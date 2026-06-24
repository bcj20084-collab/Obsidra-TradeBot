import { env } from '../config/env.js';
import { BybitRestClient } from '../data/BybitRestClient.js';
import type { RiskDecision } from '../risk/RiskEngine.js';
import type { SignalResult } from '../signals/types.js';
import { logger } from '../utils/logger.js';
import { ExecutionJournal } from './ExecutionJournal.js';
import { OrderStateMachine } from './OrderStateMachine.js';

export class OrderManager {
  private bybit = new BybitRestClient();
  private journal = new ExecutionJournal();
  private machine = new OrderStateMachine();

  async place(signal: SignalResult, risk: RiskDecision) {
    await this.journal.write({ type: 'ORDER', message: 'write-ahead order intent', data: { signal, risk, paper: env.PAPER_TRADING } });
    this.machine.transition('PENDING', 'SUBMITTED');
    if (env.PAPER_TRADING) {
      logger.info({ module: 'OrderManager', signal, risk }, 'paper order submitted');
      return { paper: true, state: 'FILLED' as const, fillPrice: signal.entryPrice };
    }
    const side = signal.direction === 'LONG' ? 'Buy' : 'Sell';
    const qty = (risk.positionSizeUsdt / signal.entryPrice).toFixed(3);
    return this.bybit.createOrder({ symbol: env.TRADING_SYMBOL, side, qty });
  }
}
