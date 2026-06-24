import { env } from '../config/env.js';
import type { OrderbookTop } from '../data/MarketDataStore.js';
import type { SignalResult } from '../signals/types.js';
import { DailyLossGuard } from './DailyLossGuard.js';
import { PositionSizer, type TradeStats } from './PositionSizer.js';
import { PreFlightCheck } from './PreFlightCheck.js';

export interface RiskDecision { approved: boolean; reason?: string; positionSizeUsdt: number; leverage: number; stopLossPrice: number; takeProfitPrice: number; trailingStopPct: number; }
export interface RiskInput { signal: SignalResult; realizedPnlToday: number; currentDrawdownPct: number; tradeStats: TradeStats; orderbook?: OrderbookTop; hasOpenPosition: boolean; bybitHeartbeatOk: boolean; atr: number; price: number; }

export class RiskEngine {
  private daily = new DailyLossGuard(env.DAILY_LOSS_LIMIT_USDT);
  private sizer = new PositionSizer();
  private preflight = new PreFlightCheck();

  approve(input: RiskInput): RiskDecision {
    const blocked = (reason: string): RiskDecision => ({ approved: false, reason, positionSizeUsdt: 0, leverage: 0, stopLossPrice: input.signal.stopLoss, takeProfitPrice: input.signal.takeProfit, trailingStopPct: 0 });
    const daily = this.daily.check(input.realizedPnlToday);
    if (!daily.ok) return blocked(daily.reason);
    if (input.currentDrawdownPct > env.MAX_DRAWDOWN_PCT) return blocked(`Max drawdown exceeded: ${input.currentDrawdownPct}%`);
    const pre = this.preflight.run({ orderbook: input.orderbook, hasOpenPosition: input.hasOpenPosition, bybitHeartbeatOk: input.bybitHeartbeatOk, spreadMaxPct: env.SPREAD_MAX_PCT });
    if (!pre.ok) return blocked(pre.reason);
    const positionSizeUsdt = this.sizer.size(input.tradeStats, env.TRADING_POSITION_MAX_USDT);
    const atrBased = Math.floor(0.02 / Math.max(input.atr / input.price, 0.001));
    const leverage = Math.max(1, Math.min(env.TRADING_LEVERAGE_MAX, atrBased));
    return { approved: true, positionSizeUsdt, leverage, stopLossPrice: input.signal.stopLoss, takeProfitPrice: input.signal.takeProfit, trailingStopPct: 1.5 };
  }
}
