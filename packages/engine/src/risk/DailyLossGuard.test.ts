import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  trade: {
    aggregate: vi.fn(),
  },
}));

vi.mock("@obsidra/shared", () => ({ prisma: prismaMock }));

import { DailyLossGuard } from "./DailyLossGuard.js";

describe("DailyLossGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks at exactly the daily loss limit", async () => {
    prismaMock.trade.aggregate
      .mockResolvedValueOnce({ _sum: { pnlUsdt: -50 } })
      .mockResolvedValueOnce({ _sum: { pnlUsdt: -50 } });

    const result = await new DailyLossGuard(50, 150).check();

    expect(result.allowed).toBe(false);
    expect(result.realizedPnl).toBe(-50);
    expect(prismaMock.trade.aggregate).toHaveBeenNthCalledWith(1, {
      where: { closedAt: { gte: expect.any(Date) } },
      _sum: { pnlUsdt: true },
    });
  });

  it("blocks at exactly the weekly loss limit", async () => {
    prismaMock.trade.aggregate
      .mockResolvedValueOnce({ _sum: { pnlUsdt: -10 } })
      .mockResolvedValueOnce({ _sum: { pnlUsdt: -150 } });

    const result = await new DailyLossGuard(50, 150).check();

    expect(result.allowed).toBe(false);
    expect(result.weeklyPnl).toBe(-150);
  });

  it("allows trading while daily and weekly losses are inside limits", async () => {
    prismaMock.trade.aggregate
      .mockResolvedValueOnce({ _sum: { pnlUsdt: -49.99 } })
      .mockResolvedValueOnce({ _sum: { pnlUsdt: -149.99 } });

    await expect(new DailyLossGuard(50, 150).check()).resolves.toMatchObject({ allowed: true });
  });
});
