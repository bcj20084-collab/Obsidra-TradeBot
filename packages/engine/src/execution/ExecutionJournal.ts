import { auditLogger } from '../utils/logger.js';

export interface JournalEvent { type: 'SIGNAL' | 'RISK_DECISION' | 'ORDER' | 'FILL' | 'CLOSE' | 'ERROR'; message: string; data?: Record<string, unknown>; }

export class ExecutionJournal {
  async write(event: JournalEvent) {
    auditLogger.info({ module: 'ExecutionJournal', ...event });
  }

  calculateNetPnl(input: { grossPnl: number; entryFee: number; exitFee: number }) { return input.grossPnl - input.entryFee - input.exitFee; }
  calculateSlippage(fillPrice: number, intendedPrice: number) { return Math.abs(fillPrice - intendedPrice) / intendedPrice; }
}
