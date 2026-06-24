import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './CircuitBreaker.js';

describe('CircuitBreaker', () => {
  it('trips and resets with reason', () => {
    const breaker = new CircuitBreaker();
    breaker.trip('daily loss');
    expect(breaker.isActive()).toBe(true);
    expect(breaker.getReason()).toBe('daily loss');
    breaker.reset();
    expect(breaker.isActive()).toBe(false);
    expect(breaker.getReason()).toBe('');
  });
});
