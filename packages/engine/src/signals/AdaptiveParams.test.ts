import { describe, expect, it } from 'vitest';
import { AdaptiveParams } from './AdaptiveParams.js';

describe('AdaptiveParams', () => {
  it('tightens risk in drawdown mode', () => {
    const adaptive = new AdaptiveParams({ maxPositionPct: 2 });
    const result = adaptive.update({ atr: 2, atrAvg20: 2, adx: 25, currentDrawdownPct: 8 });
    expect(result.regime).toBe('DRAWDOWN_MODE');
    expect(result.config.minSignalScore).toBe(80);
    expect(result.config.maxPositionPct).toBeLessThanOrEqual(1);
  });

  it('detects trending regime', () => {
    const adaptive = new AdaptiveParams();
    const result = adaptive.update({ atr: 2, atrAvg20: 2, adx: 40, currentDrawdownPct: 0 });
    expect(result.regime).toBe('TRENDING');
    expect(result.config.trailingStopPct).toBeGreaterThan(1.5);
  });
});
