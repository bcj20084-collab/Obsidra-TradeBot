import type { SignalResult } from "@obsidra/shared";
import { adx, atr, bollingerBands, ema, macd, rsi } from "../indicators/index.js";
import type { MarketDataStore } from "../data/MarketDataStore.js";
import type { CircuitBreaker } from "./CircuitBreaker.js";
import type { MLScorer, MlFeatures } from "./MLScorer.js";
import type { AdaptiveParams } from "./AdaptiveParams.js";
import { buildFeatureVector, normalizeSigned } from "./MLFeatureExtractor.js";

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
    const atrSeries = atr(m15);
    const atrValue = atrSeries.at(-1) ?? 0;
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
    const avgAtr20 = atrSeries.slice(-20).reduce((sum, value) => sum + value, 0) / Math.max(1, atrSeries.slice(-20).length);
    const macdAtr = macdNow.histogram / Math.max(atrValue, Number.EPSILON);
    const priceVsEma21 = (price - ema21) / Math.max(atrValue, Number.EPSILON);
    const priceVsEma55 = (price - ema55) / Math.max(atrValue, Number.EPSILON);
    const dayOfWeek = Array.from({ length: 7 }, (_, day) => Number(day === now.getUTCDay()));
    const features: MlFeatures = {
      rsi14Norm: rsiValue / 100,
      macdHistogramNorm: macdAtr,
      bbPosition: (price - bb.lower) / Math.max(bb.upper - bb.lower, Number.EPSILON),
      volumeRatio: m15.at(-1)!.volume / Math.max(avgVolume, Number.EPSILON),
      trendStrength: adxValue / 100,
      priceVsEma21,
      priceVsEma55,
      atrRatio: atrValue / Math.max(avgAtr20, Number.EPSILON),
      hourSin: Math.sin((2 * Math.PI * now.getUTCHours()) / 24),
      hourCos: Math.cos((2 * Math.PI * now.getUTCHours()) / 24),
      dayOfWeek,
      fundingRateNorm: (ticker.fundingRate + 0.001) / 0.002,
      recentWinRate: 0.5,
      recentProfitFactor: 1,
    };
    const mlFeatures = buildFeatureVector({
      rsi_14_norm: features.rsi14Norm ?? 0.5,
      macd_hist_norm: normalizeSigned(macdAtr, -3, 3),
      bb_position: features.bbPosition ?? 0.5,
      volume_ratio: Math.min(3, features.volumeRatio ?? 1) / 3,
      trend_strength: features.trendStrength ?? 0.5,
      price_vs_ema21: normalizeSigned(priceVsEma21, -2, 2),
      price_vs_ema55: normalizeSigned(priceVsEma55, -2, 2),
      atr_ratio: Math.min(3, features.atrRatio ?? 1) / 3,
      funding_rate_norm: features.fundingRateNorm ?? 0.5,
      hour_sin: ((features.hourSin ?? 0) + 1) / 2,
      hour_cos: ((features.hourCos ?? 0) + 1) / 2,
      day_mon: dayOfWeek[1] ?? 0,
      day_tue: dayOfWeek[2] ?? 0,
      day_wed: dayOfWeek[3] ?? 0,
      day_thu: dayOfWeek[4] ?? 0,
      day_fri: dayOfWeek[5] ?? 0,
      day_sat: dayOfWeek[6] ?? 0,
      day_sun: dayOfWeek[0] ?? 0,
      recent_win_rate: 0.5,
      recent_pf: 1 / 3,
    });
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
      mlFeatures,
      mlAdjustment,
      regime,
      trendScore: 40,
      entryScore: baseScore,
      timestamp: Date.now(),
    };
  }
}
