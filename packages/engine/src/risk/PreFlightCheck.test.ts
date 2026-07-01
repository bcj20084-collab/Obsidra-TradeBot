import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trade: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({ prisma: prismaMock }));

import type { IExchangeAdapter } from "../exchanges/IExchangeAdapter.js";
import { PreFlightCheck } from "./PreFlightCheck.js";

describe("PreFlightCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.trade.findFirst.mockResolvedValue(null);
  });

  it("rejects when spread is too wide", async () => {
    const check = new PreFlightCheck(adapter({ bid: 100, ask: 101 }), 0.5);

    const result = await check.run("BTCUSDT");

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Spread/);
  });

  it("rejects when an existing open position exists", async () => {
    prismaMock.trade.findFirst.mockResolvedValue({ id: "trade-1" });
    const check = new PreFlightCheck(adapter({ bid: 100, ask: 100.01 }), 0.5);

    await expect(check.run("BTCUSDT")).resolves.toEqual({ allowed: false, reason: "Open position already exists" });
  });

  it("rejects high latency for live adapters", async () => {
    const check = new PreFlightCheck(adapter({ bid: 100, ask: 100.01 }, { paperTrading: false, pingMs: 2_001 }), 0.5);

    const result = await check.run("BTCUSDT");

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/latency too high/);
  });

  it("allows a clean paper pre-flight", async () => {
    const check = new PreFlightCheck(adapter({ bid: 100, ask: 100.01 }), 0.5);
    await expect(check.run("BTCUSDT")).resolves.toEqual({ allowed: true });
  });
});

function adapter(
  book: { bid: number; ask: number },
  options: { paperTrading?: boolean; pingMs?: number } = {},
): IExchangeAdapter {
  return {
    exchangeId: "binance",
    paperTrading: options.paperTrading ?? true,
    getBestBidAsk: vi.fn().mockResolvedValue(book),
    ping: vi.fn().mockResolvedValue(options.pingMs ?? 10),
  } as unknown as IExchangeAdapter;
}
