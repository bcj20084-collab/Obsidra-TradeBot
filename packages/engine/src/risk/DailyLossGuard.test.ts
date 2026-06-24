import { describe, expect, it } from 'vitest';
import { DailyLossGuard } from './DailyLossGuard.js';

describe('DailyLossGuard', () => {
  it('blocks when realized loss reaches limit', () => {
    const result = new DailyLossGuard(50).check(-50);
    expect(result.ok).toBe(false);
  });

  it('allows when realized loss is inside limit', () => {
    const result = new DailyLossGuard(50).check(-25);
    expect(result.ok).toBe(true);
  });
});
