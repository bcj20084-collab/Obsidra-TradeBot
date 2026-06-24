import { BybitRestClient } from '../data/BybitRestClient.js';
import { logger } from '../utils/logger.js';

export class ReconciliationService {
  constructor(private readonly bybit = new BybitRestClient()) {}
  async run() {
    try {
      const positions = await this.bybit.getOpenPositions();
      logger.info({ module: 'ReconciliationService', positions }, 'reconciliation completed');
      return positions;
    } catch (error) {
      logger.warn({ module: 'ReconciliationService', error }, 'reconciliation failed');
      return null;
    }
  }
}
