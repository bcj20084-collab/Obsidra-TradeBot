import type { SignalResult } from "@obsidra/shared";
import { adx, atr, bollingerBands, ema, macd, rsi } from "../indicators/index.js";
import type { MarketDataStore } from "../data/MarketDataStore.js";
import type { CircuitBreaker } from "./CircuitBreaker.js";
import type { MLScorer, MlFeatures } from "./MLScorer.js";
import type { AdaptiveParams } from "./AdaptiveParams.js";

export class SignalEngine {
  constructor(
    private readonly store: MarketDataStore,
    private readonly ml: MLScorer,
    private readonly adaptive: AdaptiveParams,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  evaluate(symbol: string): SignalResult | null {
    const h4 = this.store.getCandles(symbol, "240");
    const m15 = this.store.getCandles(symbol, "15");
    const ticker = this.store.getTicker(symbol);
    if (h4.length < 80 || m15.length < 60 || !ticker) return null;
    const h4Close = h4.map((c) => c.close);
    const ema21 = ema(h4Close, 21).at(-1)!;
    const ema55 = ema(h4Close, 55).at(-1)!;
    const adxValue = adx(h4).at(-1) ?? 0;
    const price = ticker.price;
    const direction = price > ema21 && ema21 > ema55 && adxValue > 25
      ? "LONG"
      : price < ema21 && ema21 < ema55 && adxValue > 25
        ? "SHORT"
        : null;
    if (!direction || this.circuitBreaker.state.active) return null;
    const closes = m15.map((c) => c.close);
    const rsiValue = rsi(closes).at(-1) ?? 50;
    const macdPoints = macd(closes);
    const macdNow = macdPoints.at(-1);
    const macdPrevious = macdPoints.at(-2);
    const bb = bollingerBands(closes).at(-1);
    const atrValue = atr(m15).at(-1) ?? 0;
    if (!macdNow || !macdPrevious || !bb || atrValue / price >= 0.03) return null;
    let baseScore = 0;
    if (direction === "LONG" ? rsiValue < 35 : rsiValue > 65) baseScore += 33;
    const crossover = direction === "LONG"
      ? macdPrevious.macd <= macdPrevious.signal && macdNow.macd > macdNow.signal
      : macdPrevious.macd >= macdPrevious.signal && macdNow.macd < macdNow.signal;
    if (crossover) baseScore += 33;
    const bandDistance = (bb.upper - bb.lower) * 0.1;
    if (direction === "LONG" ? price <= bb.lower + bandDistance : price >= bb.upper - bandDistance) baseScore += 34;
    if (direction === "LONG" && ticker.fundingRate > 0.0005) return null;
    const now = new Date();
    const avgVolume = m15.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / 20;
    const features: MlFeatures = {
      rsi14Norm: rsiValue / 100,
      macdHistogramNorm: macdNow.histogram / Math.max(atrValue, Number.EPSILON),
      bbPosition: (price - bb.lower) / Math.max(bb.upper - bb.lower, Number.EPSILON),
      volumeRatio: m15.at(-1)!.volume / Math.max(avgVolume, Number.EPSILON),
      trendStrength: adxValue / 100,
      hourSin: Math.sin((2 * Math.PI * now.getUTCHours()) / 24),
      hourCos: Math.cos((2 * Math.PI * now.getUTCHours()) / 24),
      dayOfWeek: Array.from({ length: 7 }, (_, day) => Number(day === now.getUTCDay())),
      fundingRateNorm: ticker.fundingRate * 100,
      recentWinRate: 0.5,
    };
    const mlAdjustment = this.ml.score(features);
    const score = Math.max(0, Math.min(100, baseScore + mlAdjustment));
    const { config, regime } = this.adaptive.snapshot;
    if (score < config.minSignalScore || regime === "RANGING") return null;
    const stopLoss = direction === "LONG" ? price - config.slMultiplier * atrValue : price + config.slMultiplier * atrValue;
    const takeProfit = direction === "LONG" ? price + config.tpMultiplier * atrValue : price - config.tpMultiplier * atrValue;
    return {
      symbol,
      direction,
      score: Math.round(score),
      entryPrice: price,
      stopLoss,
      takeProfit,
      confidence: score / 100,
      indicators: { ema21, ema55, adx: adxValue, rsi: rsiValue, macd: macdNow.macd, atr: atrValue, bbLower: bb.lower, bbUpper: bb.upper },
      mlAdjustment,
      regime,
      trendScore: 40,
      entryScore: baseScore,
      timestamp: Date.now(),
    };
  }
}
