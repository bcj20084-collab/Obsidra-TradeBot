import { z } from "zod";
import { prisma } from "@obsidra/shared";
import { protectedProcedure, router } from "../trpc.js";

export const controlRouter = router({
  setStatus: protectedProcedure
    .input(z.object({ status: z.enum(["RUNNING", "PAUSED", "STOPPED"]), reason: z.string().max(200).default("Dashboard control") }))
    .mutation(async ({ input }) => {
      await prisma.$transaction([
        prisma.botState.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", status: input.status, reason: input.reason },
          update: { status: input.status, reason: input.reason },
        }),
        prisma.botEvent.create({ data: { type: input.status, message: input.reason } }),
        prisma.auditLog.create({
          data: { action: `BOT_${input.status}`, actor: "dashboard", details: { reason: input.reason } },
        }),
      ]);
      return { ok: true };
    }),
  testNotification: protectedProcedure
    .input(z.object({ channel: z.enum(["telegram", "discord"]) }))
    .mutation(async ({ input }) => {
      await prisma.botEvent.create({ data: { type: "NOTIFICATION_TEST", message: `Test requested for ${input.channel}` } });
      return { queued: true };
    }),
});
