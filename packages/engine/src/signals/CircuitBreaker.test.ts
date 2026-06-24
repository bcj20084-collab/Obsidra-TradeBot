import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./CircuitBreaker.js";

describe("CircuitBreaker", () => {
  it("trips after three consecutive losses", () => {
    const breaker = new CircuitBreaker();
    breaker.recordTrade(-1);
    breaker.recordTrade(-1);
    breaker.recordTrade(-1);
    expect(breaker.state.active).toBe(true);
  });

  it("resets the loss streak after a win", () => {
    const breaker = new CircuitBreaker();
    breaker.recordTrade(-1);
    breaker.recordTrade(1);
    expect(breaker.state.consecutiveLosses).toBe(0);
  });
});
