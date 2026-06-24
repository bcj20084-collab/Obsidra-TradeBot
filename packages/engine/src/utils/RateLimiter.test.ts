import { describe, expect, it } from 'vitest';
import { RateLimiter } from './RateLimiter.js';

describe('RateLimiter', () => {
  it('allows capacity immediately and blocks extra cost', () => {
    const limiter = new RateLimiter(2, 1);
    expect(limiter.tryUse()).toBe(true);
    expect(limiter.tryUse()).toBe(true);
    expect(limiter.tryUse()).toBe(false);
  });
});
