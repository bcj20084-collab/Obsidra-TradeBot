import { describe, expect, it } from 'vitest';
import { ReconciliationService } from './ReconciliationService.js';

const logs = { create: async () => ({}) };

describe('ReconciliationService', () => {
  it('reports ok when exchange and db have no open position', async () => {
    const bybit = { getOpenPositions: async () => ({ list: [] }) };
    const trades = { openForSymbol: async () => null };
    const service = new ReconciliationService(bybit as never, trades as never, logs as never);
    const report = await service.run();
    expect(report?.ok).toBe(true);
    expect(report?.alerts).toHaveLength(0);
  });

  it('reports mismatch when exchange has position missing in db', async () => {
    const bybit = { getOpenPositions: async () => ({ list: [{ symbol: 'BTCUSDT', size: '1', side: 'Buy' }] }) };
    const trades = { openForSymbol: async () => null };
    const service = new ReconciliationService(bybit as never, trades as never, logs as never);
    const report = await service.run();
    expect(report?.ok).toBe(false);
    expect(report?.alerts[0]).toContain('Exchange has an open position');
  });
});
