import type { MarketDataStore } from '../data/MarketDataStore.js';
import { adx, atr, bollinger, closes, ema, macd, rsi } from '../indicators/index.js';
import { env } from '../config/env.js';
import { AdaptiveParams } from './AdaptiveParams.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { MLScorer } from './MLScorer.js';
import type { SignalResult, TrendBias } from './types.js';

export class SignalEngine {
  constructor(private readonly store: MarketDataStore, private readonly ml = new MLScorer(), private readonly adaptive = new AdaptiveParams({ minSignalScore: env.MIN_SIGNAL_SCORE, leverageMax: env.TRADING_LEVERAGE_MAX }), private readonly breaker = new CircuitBreaker()) {}

  evaluate(): SignalResult | null {
    if (this.breaker.isActive()) return null;
    const candles4h = this.store.getCandles('240');
    const candles15m = this.store.getCandles('15');
    const ticker = this.store.getTicker();
    if (candles4h.length < 60 || candles15m.length < 30 || !ticker) return null;

    const price = ticker.price;
    const c4 = closes(candles4h);
    const ema21 = ema(c4, 21).at(-1) ?? price;
    const ema55 = ema(c4, 55).at(-1) ?? price;
    const trendAdx = adx(candles4h);
    const trend: TrendBias = price > ema21 && ema21 > ema55 && trendAdx > 25 ? 'LONG' : price < ema21 && ema21 < ema55 && trendAdx > 25 ? 'SHORT' : 'NEUTRAL';
    if (trend === 'NEUTRAL') return null;

    const c15 = closes(candles15m);
    const rsi14 = rsi(c15);
    const m = macd(c15);
    const bb = bollinger(c15);
    const atr14 = atr(candles15m);
    const atrAvg20 = candles15m.slice(-20).reduce((s, _, i, arr) => s + atr(arr.slice(0, i + 1)), 0) / 20;
    const { config } = this.adaptive.update({ atr: atr14, atrAvg20, adx: trendAdx, currentDrawdownPct: 0 });

    let score = 0;
    if (trend === 'LONG') {
      if (rsi14 < 35) score += 33;
      if (m.previousHistogram <= 0 && m.histogram > 0) score += 33;
      if (price <= bb.lower * 1.01) score += 34;
    } else {
      if (rsi14 > 65) score += 33;
      if (m.previousHistogram >= 0 && m.histogram < 0) score += 33;
      if (price >= bb.upper * 0.99) score += 34;
    }

    const mlAdjustment = this.ml.score({ rsi14Norm: rsi14 / 100, macdHistogramNorm: atr14 ? m.histogram / atr14 : 0, bbPosition: (price - bb.lower) / Math.max(bb.upper - bb.lower, 1), volumeRatio: 1, trendStrength: trendAdx / 100, hourSin: Math.sin((2 * Math.PI * new Date().getUTCHours()) / 24), hourCos: Math.cos((2 * Math.PI * new Date().getUTCHours()) / 24), fundingRateNorm: ticker.fundingRate * 100, recentWinRate: 0.5 });
    score = Math.max(0, Math.min(100, score + mlAdjustment));
    if (score < config.minSignalScore) return null;
    if (trend === 'LONG' && ticker.fundingRate > 0.0005) return null;
    if (atr14 / price >= 0.03) return null;

    const stopLoss = trend === 'LONG' ? price - config.slMultiplier * atr14 : price + config.slMultiplier * atr14;
    const takeProfit = trend === 'LONG' ? price + config.tpMultiplier * atr14 : price - config.tpMultiplier * atr14;
    return { direction: trend, score, entryPrice: price, stopLoss, takeProfit, confidence: score >= 85 ? 'HIGH' : score >= 75 ? 'MEDIUM' : 'LOW', indicators: { ema21, ema55, adx: trendAdx, rsi14, macdHistogram: m.histogram, atr14, fundingRate: ticker.fundingRate, regime: this.adaptive.getRegime() } };
  }
}
