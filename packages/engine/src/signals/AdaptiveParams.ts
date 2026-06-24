export interface AdaptiveConfig { minSignalScore: number; slMultiplier: number; tpMultiplier: number; maxPositionPct: number; leverageMax: number; trailingStopPct: number; }
export type MarketRegime = 'NORMAL' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY' | 'TRENDING' | 'RANGING' | 'DRAWDOWN_MODE';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export class AdaptiveParams {
  private config: AdaptiveConfig;
  private regime: MarketRegime = 'NORMAL';
  constructor(base: Partial<AdaptiveConfig> = {}) { this.config = { minSignalScore: 65, slMultiplier: 1.5, tpMultiplier: 2.5, maxPositionPct: 2, leverageMax: 5, trailingStopPct: 1.5, ...base }; }

  update(input: { atr: number; atrAvg20: number; adx: number; currentDrawdownPct: number }) {
    let next = { ...this.config };
    let regime: MarketRegime = 'NORMAL';
    if (input.currentDrawdownPct > 5) { regime = 'DRAWDOWN_MODE'; next.maxPositionPct *= 0.5; next.minSignalScore = 80; }
    else if (input.atrAvg20 > 0 && input.atr > input.atrAvg20 * 1.5) { regime = 'HIGH_VOLATILITY'; next.leverageMax -= 1; next.slMultiplier += 0.4; }
    else if (input.atrAvg20 > 0 && input.atr < input.atrAvg20 * 0.5) { regime = 'LOW_VOLATILITY'; next.minSignalScore = 75; }
    else if (input.adx > 35) { regime = 'TRENDING'; next.trailingStopPct += 0.5; }
    else if (input.adx < 20) { regime = 'RANGING'; next.minSignalScore = 78; }
    this.regime = regime;
    this.config = { minSignalScore: clamp(next.minSignalScore, 55, 85), slMultiplier: clamp(next.slMultiplier, 1, 2.5), tpMultiplier: clamp(next.tpMultiplier, 1.5, 4), maxPositionPct: clamp(next.maxPositionPct, 0.5, 3), leverageMax: clamp(next.leverageMax, 1, 10), trailingStopPct: clamp(next.trailingStopPct, 0.8, 3) };
    return { regime: this.regime, config: this.config };
  }

  getConfig() { return this.config; }
  getRegime() { return this.regime; }
}
