import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
export class CopyTradingStrategy extends BaseStrategy { async onCandle(_candle: OHLCVCandle): Promise<void> {} }
