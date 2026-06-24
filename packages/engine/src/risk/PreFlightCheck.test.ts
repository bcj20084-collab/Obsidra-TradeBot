import { describe, expect, it } from 'vitest';
import { PreFlightCheck } from './PreFlightCheck.js';

describe('PreFlightCheck', () => {
  it('blocks stale heartbeat', () => {
    const result = new PreFlightCheck().run({ orderbook: { bid: 100, ask: 100.01, ts: Date.now() }, hasOpenPosition: false, bybitHeartbeatOk: false, spreadMaxPct: 0.05 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('heartbeat');
  });

  it('blocks high spread', () => {
    const result = new PreFlightCheck().run({ orderbook: { bid: 99, ask: 101, ts: Date.now() }, hasOpenPosition: false, bybitHeartbeatOk: true, spreadMaxPct: 0.05 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Spread');
  });
});
