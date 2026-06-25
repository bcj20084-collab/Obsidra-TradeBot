import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
export class DCAStrategy extends BaseStrategy {
  private lastOrderPrice?: number; private safetyOrders = 0;
  async onCandle(candle: OHLCVCandle): Promise<void> {
    if (!["RUNNING", "PAPER"].includes(this.metrics.status)) return;
    if (!this.lastOrderPrice) { this.lastOrderPrice = candle.close; return; }
    const deviation = Math.abs(candle.close - this.lastOrderPrice) / this.lastOrderPrice * 100;
    if (deviation >= Number(this.config.params.priceDeviationPct ?? 2) && this.safetyOrders < Number(this.config.params.safetyOrderCount ?? 5)) {
      this.safetyOrders++; this.lastOrderPrice = candle.close;
    }
  }
}
