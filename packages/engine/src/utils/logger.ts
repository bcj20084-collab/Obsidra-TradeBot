import pino from 'pino';
import winston from 'winston';
import { env } from '../config/env.js';

export const logger = pino({ level: env.LOG_LEVEL, base: { service: 'obsidra-engine', version: env.BOT_VERSION }, timestamp: pino.stdTimeFunctions.isoTime });

export const auditLogger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

export function logError(module: string, error: unknown, context: Record<string, unknown> = {}) {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  logger.error({ module, err, ...context }, 'module error');
}
