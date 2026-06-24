import { describe, expect, it } from 'vitest';
import { OrderStateMachine } from './OrderStateMachine.js';

describe('OrderStateMachine', () => {
  it('allows valid transitions', () => {
    const machine = new OrderStateMachine();
    expect(machine.transition('PENDING', 'SUBMITTED')).toBe('SUBMITTED');
    expect(machine.transition('SUBMITTED', 'OPEN')).toBe('OPEN');
  });

  it('blocks invalid transitions', () => {
    const machine = new OrderStateMachine();
    expect(() => machine.transition('PENDING', 'CLOSED')).toThrow();
  });
});
