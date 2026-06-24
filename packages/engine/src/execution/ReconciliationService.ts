import { env } from '../config/env.js';
import { BybitRestClient } from '../data/BybitRestClient.js';
import { LogRepository } from '../db/repositories/LogRepository.js';
import { TradeRepository } from '../db/repositories/TradeRepository.js';
import { logger } from '../utils/logger.js';

interface ExchangePosition { symbol?: string; size?: string; side?: string; avgPrice?: string; }
interface ExchangePositionResponse { list?: ExchangePosition[]; }

export interface ReconciliationReport {
  ok: boolean;
  exchangeOpen: number;
  dbOpen: boolean;
  alerts: string[];
}

export class ReconciliationService {
  constructor(
    private readonly bybit = new BybitRestClient(),
    private readonly trades = new TradeRepository(),
    private readonly logs = new LogRepository(),
  ) {}

  async run(): Promise<ReconciliationReport | null> {
    try {
      const positions = await this.bybit.getOpenPositions() as ExchangePositionResponse;
      const activeExchangePositions = (positions.list ?? []).filter((p) => Number(p.size ?? 0) > 0);
      const dbOpen = await this.trades.openForSymbol(env.TRADING_SYMBOL);
      const alerts: string[] = [];

      if (activeExchangePositions.length > 0 && !dbOpen) alerts.push('Exchange has an open position that is missing in DB.');
      if (activeExchangePositions.length === 0 && dbOpen) alerts.push('DB has an open position that is missing on exchange.');

      const report = { ok: alerts.length === 0, exchangeOpen: activeExchangePositions.length, dbOpen: Boolean(dbOpen), alerts };
      if (!report.ok) await this.logs.create('RECONCILIATION_ALERT', 'Reconciliation mismatch detected', report);
      logger.info({ module: 'ReconciliationService', report }, 'reconciliation completed');
      return report;
    } catch (error) {
      logger.warn({ module: 'ReconciliationService', error }, 'reconciliation failed');
      await this.logs.create('RECONCILIATION_ERROR', 'Reconciliation failed', { error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
      return null;
    }
  }
}
