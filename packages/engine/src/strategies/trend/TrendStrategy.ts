import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
export class TrendStrategy extends BaseStrategy { async onCandle(_candle: OHLCVCandle): Promise<void> {} }
