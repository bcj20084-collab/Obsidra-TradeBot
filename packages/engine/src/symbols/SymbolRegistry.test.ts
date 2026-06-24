import { describe, expect, it } from "vitest";
import { SymbolRegistry } from "./SymbolRegistry.js";

describe("SymbolRegistry", () => {
  it("enforces the five symbol limit", () => {
    expect(() => new SymbolRegistry(["A", "B", "C", "D", "E", "F"])).toThrow();
  });

  it("creates equal default weights", () => {
    expect(new SymbolRegistry(["BTCUSDT", "ETHUSDT"]).list().map((item) => item.weight)).toEqual([50, 50]);
  });
});
