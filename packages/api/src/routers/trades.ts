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
});
