import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./CircuitBreaker.js";

describe("CircuitBreaker", () => {
  it("trips after three consecutive losses", () => {
    const breaker = new CircuitBreaker();
    breaker.recordTrade(-1);
    breaker.recordTrade(-1);
    breaker.recordTrade(-1);
    expect(breaker.state.active).toBe(true);
    expect(breaker.state.reason).toBe("3 consecutive losses");
    expect(breaker.state.blockedUntil).toBeInstanceOf(Date);
  });

  it("resets the loss streak after a win", () => {
    const breaker = new CircuitBreaker();
    breaker.recordTrade(-1);
    breaker.recordTrade(1);
    expect(breaker.state.consecutiveLosses).toBe(0);
  });

  it("does not remain permanently blocked after the loss cooldown expires", () => {
    let now = new Date("2026-07-06T12:00:00.000Z");
    const breaker = new CircuitBreaker({
      lossCooldownMs: 60_000,
      now: () => now,
    });

    breaker.recordTrade(-1);
    breaker.recordTrade(-1);
    breaker.recordTrade(-1);
    expect(breaker.state).toMatchObject({
      active: true,
      consecutiveLosses: 3,
      reason: "3 consecutive losses",
      remainingCooldownMs: 60_000,
    });

    now = new Date("2026-07-06T12:01:01.000Z");
    expect(breaker.state).toMatchObject({
      active: false,
      consecutiveLosses: 0,
    });
  });

  it("keeps manual trips active until an explicit reset", () => {
    let now = new Date("2026-07-06T12:00:00.000Z");
    const breaker = new CircuitBreaker({ now: () => now });

    breaker.trip("Kill switch");
    now = new Date("2026-07-07T12:00:00.000Z");
    expect(breaker.state).toMatchObject({
      active: true,
      reason: "Kill switch",
    });

    breaker.reset();
    expect(breaker.state).toMatchObject({
      active: false,
      consecutiveLosses: 0,
    });
  });
});
