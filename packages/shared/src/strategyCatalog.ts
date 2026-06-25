import type { Env } from "./env.js";

export type StrategyKind = "TREND" | "GRID" | "DCA" | "SCALP" | "COPY";
export type StrategyExchange = "bybit" | "binance";

export interface StrategyDescriptor {
  id: string;
  type: StrategyKind;
  enabled: boolean;
  exchange: StrategyExchange;
  symbol: string;
  isPaperTrading: boolean;
  maxPositionUsdt: number;
  dailyLossLimit: number;
  maxDrawdownPct: number;
  params: Record<string, unknown>;
}

export function strategyCatalog(env: Env): StrategyDescriptor[] {
  const trend = env.TREND_SYMBOLS.split(",").map((symbol) => symbol.trim()).filter(Boolean).map((symbol) => ({
    id: `trend-${symbol.toLowerCase()}`,
    type: "TREND" as const,
    enabled: env.STRATEGY_TREND_ENABLED,
    exchange: env.TREND_EXCHANGE,
    symbol,
    isPaperTrading: env.PAPER_TRADING || env.TREND_PAPER_TRADING,
    maxPositionUsdt: env.TRADING_POSITION_MAX_USDT,
    dailyLossLimit: env.DAILY_LOSS_LIMIT_USDT,
    maxDrawdownPct: env.MAX_DRAWDOWN_PCT,
    params: { leverageMax: env.TRADING_LEVERAGE_MAX },
  }));
  return [
    ...trend,
    {
      id: "grid-primary", type: "GRID", enabled: env.STRATEGY_GRID_ENABLED,
      exchange: env.GRID_EXCHANGE, symbol: env.GRID_SYMBOL, isPaperTrading: env.PAPER_TRADING || env.GRID_PAPER_TRADING,
      maxPositionUsdt: env.GRID_TOTAL_INVEST_USDT, dailyLossLimit: env.DAILY_LOSS_LIMIT_USDT,
      maxDrawdownPct: env.MAX_DRAWDOWN_PCT,
      params: { lowerPrice: env.GRID_LOWER_PRICE, upperPrice: env.GRID_UPPER_PRICE, gridCount: env.GRID_COUNT, totalInvestUsdt: env.GRID_TOTAL_INVEST_USDT },
    },
    {
      id: "dca-primary", type: "DCA", enabled: env.STRATEGY_DCA_ENABLED,
      exchange: env.DCA_EXCHANGE, symbol: env.DCA_SYMBOL, isPaperTrading: env.PAPER_TRADING || env.DCA_PAPER_TRADING,
      maxPositionUsdt: env.DCA_BASE_ORDER_USDT + env.DCA_SAFETY_ORDER_USDT * env.DCA_SAFETY_ORDER_COUNT,
      dailyLossLimit: env.DAILY_LOSS_LIMIT_USDT, maxDrawdownPct: env.MAX_DRAWDOWN_PCT,
      params: {
        direction: env.DCA_DIRECTION, baseOrderUsdt: env.DCA_BASE_ORDER_USDT,
        safetyOrderUsdt: env.DCA_SAFETY_ORDER_USDT, safetyOrderCount: env.DCA_SAFETY_ORDER_COUNT,
        priceDeviationPct: 2,
      },
    },
    {
      id: "scalp-primary", type: "SCALP", enabled: env.STRATEGY_SCALP_ENABLED,
      exchange: env.SCALP_EXCHANGE, symbol: env.SCALP_SYMBOL, isPaperTrading: env.PAPER_TRADING || env.SCALP_PAPER_TRADING,
      maxPositionUsdt: Math.min(env.TRADING_POSITION_MAX_USDT, 200),
      dailyLossLimit: env.DAILY_LOSS_LIMIT_USDT, maxDrawdownPct: env.MAX_DRAWDOWN_PCT,
      params: { leverageMax: 3 },
    },
    {
      id: "copy-primary", type: "COPY", enabled: env.STRATEGY_COPY_ENABLED,
      exchange: env.COPY_EXCHANGE, symbol: "MULTI", isPaperTrading: env.PAPER_TRADING || env.COPY_PAPER_TRADING,
      maxPositionUsdt: env.COPY_MAX_SIZE_USDT, dailyLossLimit: env.DAILY_LOSS_LIMIT_USDT,
      maxDrawdownPct: env.MAX_DRAWDOWN_PCT,
      params: { traderIds: env.COPY_TRADER_IDS.split(",").map((id) => id.trim()).filter(Boolean), ratioPct: env.COPY_RATIO_PCT },
    },
  ];
}
