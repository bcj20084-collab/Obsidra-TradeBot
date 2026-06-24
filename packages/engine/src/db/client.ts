import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function closeDatabase() {
  await prisma.$disconnect();
}

export function logDatabaseError(error: unknown) {
  logger.error({ module: 'prisma', error }, 'database error');
}
