import { describe, expect, it } from 'vitest';
import { ExposureGuard } from './ExposureGuard.js';

describe('ExposureGuard', () => {
  it('blocks exposure above configured percentage of equity', () => {
    const result = new ExposureGuard().check({ requestedUsdt: 300, equityUsdt: 1000, maxExposurePct: 20 });
    expect(result.ok).toBe(false);
  });

  it('allows exposure within configured percentage of equity', () => {
    const result = new ExposureGuard().check({ requestedUsdt: 100, equityUsdt: 1000, maxExposurePct: 20 });
    expect(result.ok).toBe(true);
  });
});
