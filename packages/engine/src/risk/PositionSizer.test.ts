import { describe, expect, it } from 'vitest';
import { PositionSizer } from './PositionSizer.js';

describe('PositionSizer', () => {
  it('uses one percent equity for low sample size', () => {
    const size = new PositionSizer().size({ count: 0, winRate: 0.5, avgWin: 1, avgLoss: 1, equity: 1000 }, 500);
    expect(size).toBe(10);
  });

  it('respects max position cap', () => {
    const size = new PositionSizer().size({ count: 50, winRate: 0.8, avgWin: 3, avgLoss: 1, equity: 10000 }, 100);
    expect(size).toBeLessThanOrEqual(100);
  });
});
