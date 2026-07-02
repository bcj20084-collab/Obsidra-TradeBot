import type { CircuitBreaker } from "./CircuitBreaker.js";

export interface TradeCloseCircuitBreakerContext {
  exchange: string;
  symbol: string;
  circuitBreaker: CircuitBreaker;
}

export interface ClosedTradeCircuitEvent {
  exchange?: string;
  symbol: string;
  pnlUsdt: number;
}

export function recordClosedTradeForCircuitBreakers(
  contexts: Iterable<TradeCloseCircuitBreakerContext>,
  trade: ClosedTradeCircuitEvent,
): TradeCloseCircuitBreakerContext[] {
  const updated: TradeCloseCircuitBreakerContext[] = [];
  for (const context of contexts) {
    const sameSymbol = context.symbol === trade.symbol;
    const sameExchange = !trade.exchange || context.exchange === trade.exchange;
    if (!sameSymbol || !sameExchange) continue;
    context.circuitBreaker.recordTrade(trade.pnlUsdt);
    updated.push(context);
  }
  return updated;
}
