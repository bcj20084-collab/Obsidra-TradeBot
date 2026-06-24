import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }],
});

prisma.$on('error', (event) => logger.error({ module: 'prisma', event }, 'database error'));
prisma.$on('warn', (event) => logger.warn({ module: 'prisma', event }, 'database warning'));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export async function closeDatabase() {
  await prisma.$disconnect();
}
