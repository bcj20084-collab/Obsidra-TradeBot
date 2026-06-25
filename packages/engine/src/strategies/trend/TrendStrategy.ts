import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import type { ExchangeId } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";

export class TrendStrategy extends BaseStrategy {
  constructor(
    config: ConstructorParameters<typeof BaseStrategy>[0],
    private readonly onSignalCandle?: (symbol: string, exchange: ExchangeId) => Promise<void>,
  ) {
    super(config);
  }

  async onCandle(candle: OHLCVCandle): Promise<void> {
    if (!["RUNNING", "PAPER"].includes(this.metrics.status) || candle.interval !== "15" || !candle.confirmed) return;
    await this.onSignalCandle?.(this.config.symbol, this.config.exchange);
  }
}
