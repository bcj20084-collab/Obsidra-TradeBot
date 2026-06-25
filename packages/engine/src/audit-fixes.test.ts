import { describe, expect, it } from "vitest";
import { MarketDataStore } from "./data/MarketDataStore.js";
import { deterministicShuffle } from "./signals/SeededShuffle.js";
import { HttpCopyPositionSource } from "./strategies/copy/CopyPositionSource.js";
import { ScalpSignalEngine } from "./strategies/scalp/ScalpSignalEngine.js";

describe("audit remediations", () => {
  it("produces a reproducible seeded shuffle without mutating input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const first = deterministicShuffle(input, 42);
    expect(first).toEqual(deterministicShuffle(input, 42));
    expect(first).not.toEqual(deterministicShuffle(input, 43));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...first].sort()).toEqual(input);
  });

  it("rejects insecure copy-position feeds", () => {
    expect(() => new HttpCopyPositionSource("http://example.test/positions")).toThrow(/HTTPS/);
  });

  it("requires all scalp confirmations before emitting a signal", () => {
    const store = new MarketDataStore();
    for (let index = 0; index < 35; index++) {
      addCandle(store, "1", index, 100 - index, index === 34 ? 1_000 : 100);
      addCandle(store, "3", index, index < 31 ? 100 - index * 0.1 : 97 + (index - 31) * 5, 100);
    }
    const signal = new ScalpSignalEngine().evaluate("BTCUSDT", store);
    expect(signal?.direction).toBe("LONG");
  });
});

function addCandle(store: MarketDataStore, timeframe: string, index: number, close: number, volume: number): void {
  store.addCandle({
    symbol: "BTCUSDT",
    timeframe,
    openTime: index,
    closeTime: index + 1,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume,
    confirmed: true,
  });
}
