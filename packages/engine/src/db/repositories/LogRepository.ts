import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../client.js';

export class LogRepository {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  create(type: string, message: string, data?: Prisma.InputJsonValue) {
    return this.db.botEvent.create({ data: { type, message, data: data ?? Prisma.JsonNull } });
  }

  latest(limit = 100) {
    return this.db.botEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
