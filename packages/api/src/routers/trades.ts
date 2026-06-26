import { z } from "zod";
import { prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const tradesRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
      direction: z.enum(["LONG", "SHORT"]).optional(),
      symbol: z.string().optional(),
    }))
    .query(({ input }) =>
      prisma.trade.findMany({
        where: {
          ...(input.direction ? { direction: input.direction } : {}),
          ...(input.symbol ? { symbol: input.symbol } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
      }),
    ),
  count: protectedProcedure.query(() => prisma.trade.count()),
  detail: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) =>
      prisma.trade.findUnique({
        where: { id: input.id },
        include: {
          transitions: { orderBy: { createdAt: "asc" } },
          journalEntries: { orderBy: { createdAt: "asc" } },
        },
      }),
    ),
  candles: protectedProcedure
    .input(z.object({ id: z.string().min(1), interval: z.string().default("15"), limit: z.number().int().min(50).max(500).default(180) }))
    .query(async ({ input }) => {
      const trade = await prisma.trade.findUnique({ where: { id: input.id } });
      if (!trade) return [];
      const center = trade.openedAt ?? trade.createdAt;
      const start = BigInt(center.getTime() - 36 * 60 * 60_000);
      const end = BigInt((trade.closedAt ?? new Date()).getTime() + 12 * 60 * 60_000);
      const rows = await prisma.historicalCandle.findMany({
        where: { symbol: trade.symbol, interval: input.interval, openTime: { gte: start, lte: end } },
        orderBy: { openTime: "asc" },
        take: input.limit,
      });
      return rows.map((row) => ({
        time: Number(row.openTime),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }));
    }),
});
