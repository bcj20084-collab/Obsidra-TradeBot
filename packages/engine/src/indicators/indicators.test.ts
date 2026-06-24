import { describe, expect, it } from "vitest";
import { bollingerBands, ema, macd, rsi } from "./index.js";

describe("indicators", () => {
  const values = Array.from({ length: 100 }, (_, index) => 100 + index + Math.sin(index));

  it("calculates EMA without NaN", () => {
    expect(ema(values, 21).at(-1)).toBeGreaterThan(0);
  });

  it("keeps RSI in its valid range", () => {
    expect(rsi(values).every((value) => value >= 0 && value <= 100)).toBe(true);
  });

  it("calculates MACD and Bollinger bands", () => {
    expect(macd(values).length).toBeGreaterThan(0);
    const band = bollingerBands(values).at(-1)!;
    expect(band.lower).toBeLessThan(band.upper);
  });
});
