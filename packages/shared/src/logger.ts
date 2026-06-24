import pino from "pino";
import winston from "winston";
import { getEnv } from "./env.js";

const env = getEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "obsidra" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const auditLogger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

export function moduleLogger(module: string) {
  return logger.child({ module });
}
