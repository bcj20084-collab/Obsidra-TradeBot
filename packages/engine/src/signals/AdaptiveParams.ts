import { prisma, type AdaptiveConfig, type MarketRegime } from "@obsidra/shared";

const DEFAULTS: AdaptiveConfig = {
  minSignalScore: 65,
  slMultiplier: 1.5,
  tpMultiplier: 2.5,
  maxPositionPct: 2,
  leverageMax: 5,
  trailingStopPct: 1.5,
};

export class AdaptiveParams {
  private config: AdaptiveConfig = { ...DEFAULTS };
  private regime: MarketRegime = "NORMAL";

  async update(atrValue: number, averageAtr: number, adxValue: number, drawdownPct: number): Promise<void> {
    let regime: MarketRegime = "NORMAL";
    const next = { ...DEFAULTS };
    if (drawdownPct > 5) {
      regime = "DRAWDOWN_MODE";
      next.maxPositionPct = 1;
      next.minSignalScore = 80;
    } else if (atrValue > averageAtr * 1.5) {
      regime = "HIGH_VOLATILITY";
      next.leverageMax = 3;
      next.slMultiplier = 2;
    } else if (atrValue < averageAtr * 0.5) {
      regime = "LOW_VOLATILITY";
      next.minSignalScore = 75;
    } else if (adxValue > 35) {
      regime = "TRENDING";
      next.trailingStopPct = 2.5;
    } else if (adxValue < 20) {
      regime = "RANGING";
    }
    this.clamp(next);
    if (regime !== this.regime) {
      await prisma.adaptiveLog.create({
        data: { regime, config: next, reason: `ATR=${atrValue}, avgATR=${averageAtr}, ADX=${adxValue}, DD=${drawdownPct}` },
      });
    }
    this.regime = regime;
    this.config = next;
  }

  get snapshot(): { regime: MarketRegime; config: AdaptiveConfig } {
    return { regime: this.regime, config: { ...this.config } };
  }

  private clamp(config: AdaptiveConfig): void {
    config.minSignalScore = Math.min(85, Math.max(55, config.minSignalScore));
    config.slMultiplier = Math.min(2.5, Math.max(1, config.slMultiplier));
    config.tpMultiplier = Math.min(4, Math.max(1.5, config.tpMultiplier));
    config.maxPositionPct = Math.min(3, Math.max(0.5, config.maxPositionPct));
    config.leverageMax = Math.min(10, Math.max(1, config.leverageMax));
    config.trailingStopPct = Math.min(3, Math.max(0.8, config.trailingStopPct));
  }
}
