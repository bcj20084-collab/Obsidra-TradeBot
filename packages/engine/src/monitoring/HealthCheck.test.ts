import { describe, expect, it } from 'vitest';
import { HealthCheck } from './HealthCheck.js';

describe('HealthCheck', () => {
  it('returns running snapshot by default', () => {
    const health = new HealthCheck();
    const snapshot = health.snapshot();
    expect(snapshot.status).toBe('RUNNING');
    expect(snapshot.stale).toBe(false);
  });

  it('updates status', () => {
    const health = new HealthCheck();
    health.set('PAUSED');
    expect(health.snapshot().status).toBe('PAUSED');
  });
});
