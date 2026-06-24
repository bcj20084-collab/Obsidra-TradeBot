import { describe, expect, it } from 'vitest';
import { MetricsCollector } from './MetricsCollector.js';

describe('MetricsCollector', () => {
  it('returns safe default metrics', () => {
    const metrics = new MetricsCollector().snapshot();
    expect(metrics.botStatus).toBe('RUNNING');
    expect(metrics.marketRegime).toBe('NORMAL');
    expect(metrics.totalPnlUsdt).toBe(0);
    expect(metrics.adaptiveConfig.minSignalScore).toBeGreaterThanOrEqual(55);
  });
});
