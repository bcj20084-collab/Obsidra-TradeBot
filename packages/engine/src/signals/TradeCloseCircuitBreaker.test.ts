import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./CircuitBreaker.js";
import { recordClosedTradeForCircuitBreakers, type TradeCloseCircuitBreakerContext } from "./TradeCloseCircuitBreaker.js";

function context(exchange: string, symbol: string): TradeCloseCircuitBreakerContext {
  return { exchange, symbol, circuitBreaker: new CircuitBreaker() };
}

describe("recordClosedTradeForCircuitBreakers", () => {
  it("records closed trade PnL only on the matching exchange/symbol context", () => {
    const binanceDog = context("binance", "DOGEUSDT");
    const bybitDog = context("bybit", "DOGEUSDT");
    const binanceEth = context("binance", "ETHUSDT");

    const updated = recordClosedTradeForCircuitBreakers([binanceDog, bybitDog, binanceEth], {
      exchange: "binance",
      symbol: "DOGEUSDT",
      pnlUsdt: -1,
    });

    expect(updated).toEqual([binanceDog]);
    expect(binanceDog.circuitBreaker.state.consecutiveLosses).toBe(1);
    expect(bybitDog.circuitBreaker.state.consecutiveLosses).toBe(0);
    expect(binanceEth.circuitBreaker.state.consecutiveLosses).toBe(0);
  });

  it("trips after three matching consecutive losses", () => {
    const doge = context("binance", "DOGEUSDT");

    for (const pnlUsdt of [-1, -2, -3]) {
      recordClosedTradeForCircuitBreakers([doge], { exchange: "binance", symbol: "DOGEUSDT", pnlUsdt });
    }

    expect(doge.circuitBreaker.state).toMatchObject({
      active: true,
      consecutiveLosses: 3,
      reason: "3 consecutive losses",
    });
  });

  it("resets the matching loss streak after a win", () => {
    const doge = context("binance", "DOGEUSDT");

    recordClosedTradeForCircuitBreakers([doge], { exchange: "binance", symbol: "DOGEUSDT", pnlUsdt: -1 });
    recordClosedTradeForCircuitBreakers([doge], { exchange: "binance", symbol: "DOGEUSDT", pnlUsdt: 2 });

    expect(doge.circuitBreaker.state.consecutiveLosses).toBe(0);
    expect(doge.circuitBreaker.state.active).toBe(false);
  });
});
