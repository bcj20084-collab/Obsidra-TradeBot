import { describe, expect, it } from 'vitest';
import { ExecutionJournal } from './ExecutionJournal.js';

describe('ExecutionJournal', () => {
  it('calculates net pnl after fees', () => {
    const journal = new ExecutionJournal();
    expect(journal.calculateNetPnl({ grossPnl: 10, entryFee: 1, exitFee: 2 })).toBe(7);
  });

  it('calculates absolute slippage ratio', () => {
    const journal = new ExecutionJournal();
    expect(journal.calculateSlippage(101, 100)).toBeCloseTo(0.01);
  });
});
