import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
export class ScalpStrategy extends BaseStrategy {
  readonly maxLeverage = 3;
  async onCandle(candle: OHLCVCandle): Promise<void> {
    if (!["RUNNING", "PAPER"].includes(this.metrics.status)) return;
    const hour = new Date(candle.openTime).getUTCHours();
    const hours = this.config.params.tradingHours as { start: number; end: number } | undefined;
    if (hours && (hour < hours.start || hour >= hours.end)) return;
  }
}
