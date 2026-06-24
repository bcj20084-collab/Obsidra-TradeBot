import { z } from "zod";
import { prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const auditRouter = router({
  list: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(100) }).default({ limit: 100 })).query(({ input }) => prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: input.limit,
  })),
});
