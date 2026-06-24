import { describe, expect, it } from 'vitest';
import { store } from './store.js';

describe('control store', () => {
  it('records status changes as events', () => {
    const snapshot = store.setStatus('PAUSED', 'test pause');
    expect(snapshot.status).toBe('PAUSED');
    expect(snapshot.events[0]?.message).toBe('test pause');
  });

  it('updates runtime config safely', () => {
    const snapshot = store.updateConfig({ minSignalScore: 70 });
    expect(snapshot.config.minSignalScore).toBe(70);
  });
});
