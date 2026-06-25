import { beforeAll, describe, expect, it } from "vitest";
import { MarketDataStore } from "../data/MarketDataStore.js";
import { CircuitBreaker } from "./CircuitBreaker.js";

let SignalEngine: typeof import("./SignalEngine.js").SignalEngine;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/obsidra";
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.DASHBOARD_PASSWORD = "test-password";
  ({ SignalEngine } = await import("./SignalEngine.js"));
});

function engineWith(store: MarketDataStore) {
  return new SignalEngine(
    store,
    { score: () => 0 } as never,
    { snapshot: { regime: "NORMAL", config: {
      minSignalScore: 65,
      slMultiplier: 1.5,
      tpMultiplier: 2.5,
      maxPositionPct: 2,
      leverageMax: 5,
      trailingStopPct: 1.5,
    } } } as never,
    new CircuitBreaker(),
  );
}

describe("SignalEngine diagnostics", () => {
  it("explains when market data is incomplete", async () => {
    const result = await engineWith(new MarketDataStore()).evaluateDetailed("BTCUSDT");
    expect(result.signal).toBeNull();
    expect(result.reason).toBe("INSUFFICIENT_DATA");
    expect(result.details).toMatchObject({ h4Candles: 0, m15Candles: 0, tickerAvailable: false });
  });

  it("explains when no directional trend exists", async () => {
    const store = new MarketDataStore();
    for (let index = 0; index < 80; index++) {
      store.addCandle({
        symbol: "BTCUSDT",
        timeframe: "240",
        openTime: index,
        closeTime: index + 1,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
        confirmed: true,
      });
    }
    for (let index = 0; index < 60; index++) {
      store.addCandle({
        symbol: "BTCUSDT",
        timeframe: "15",
        openTime: index,
        closeTime: index + 1,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
        confirmed: true,
      });
    }
    store.setTicker({ symbol: "BTCUSDT", price: 100, fundingRate: 0, openInterest: 0, timestamp: Date.now() });

    const result = await engineWith(store).evaluateDetailed("BTCUSDT");
    expect(result.signal).toBeNull();
    expect(result.reason).toBe("NO_TREND");
  });
});
