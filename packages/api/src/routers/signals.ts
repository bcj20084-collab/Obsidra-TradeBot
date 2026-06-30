import { z } from "zod";
import { prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

const signalTypes = [
  "SIGNAL_READY",
  "SIGNAL_SKIPPED",
  "SIGNAL_GENERATED",
  "RISK_REJECTED",
  "PAPER_PARTIAL_TAKE_PROFIT",
  "PAPER_PROTECTION_UPDATED",
  "PAPER_POSITION_DANGER",
  "TRADE_LOSS_ANALYZED",
] as const;

type SignalFeedData = {
  exchange?: string;
  symbol?: string;
  reason?: string;
  details?: Record<string, unknown>;
  signal?: {
    direction?: string;
    score?: number;
    confidence?: number;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    regime?: string;
  };
  decision?: { reason?: string; approved?: boolean };
  price?: number;
  previousStop?: number;
  nextStop?: number;
  profitR?: number;
  unrealizedPnlUsdt?: number;
};

export const signalsRouter = router({
  feed: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(40) }).default({ limit: 40 }))
    .query(async ({ input }) => {
      const rows = await prisma.journalEntry.findMany({
        where: { type: { in: [...signalTypes] } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: { trade: { select: { symbol: true, exchange: true, direction: true, status: true, signalScore: true } } },
      });
      return rows.map((row) => {
        const data = row.data as SignalFeedData;
        const details = data.details ?? {};
        return {
          id: row.id,
          type: row.type,
          createdAt: row.createdAt.toISOString(),
          symbol: data.symbol ?? row.trade?.symbol ?? "UNKNOWN",
          exchange: data.exchange ?? row.trade?.exchange ?? "unknown",
          direction: data.signal?.direction ?? row.trade?.direction ?? String(details.direction ?? ""),
          status: row.trade?.status ?? null,
          score: data.signal?.score ?? row.trade?.signalScore ?? numberOrNull(details.score),
          confidence: data.signal?.confidence ?? numberOrNull(details.confidence),
          reason: data.reason ?? data.decision?.reason ?? String(details.reason ?? row.type),
          price: data.signal?.entryPrice ?? data.price ?? numberOrNull(details.price),
          stopLoss: data.signal?.stopLoss ?? data.nextStop ?? numberOrNull(details.stopLoss),
          takeProfit: data.signal?.takeProfit ?? numberOrNull(details.takeProfit),
          regime: data.signal?.regime ?? String(details.regime ?? ""),
          details,
        };
      });
    }),
});

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
