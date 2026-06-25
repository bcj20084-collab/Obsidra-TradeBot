import { prisma, type Prisma } from "@obsidra/shared";

export class AuditLog {
  record(action: string, actor: string, details: Record<string, unknown>, ipAddress?: string) {
    return prisma.auditLog.create({
      data: {
        action,
        actor,
        details: details as Prisma.InputJsonValue,
        ...(ipAddress ? { ipAddress } : {}),
      },
    });
  }
}
