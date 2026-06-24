import pino from "pino";
import winston from "winston";
import { getEnv } from "./env.js";

const env = getEnv();

const sensitiveKeys = new Set(["apikey", "secret", "password", "token", "jwt", "authorization"]);

function redact(value: unknown, key = ""): unknown {
  if (sensitiveKeys.has(key.toLowerCase())) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  }
  if (typeof value === "string" && /^[A-Za-z0-9+/=_-]{32,}$/.test(value)) return "[REDACTED]";
  return value;
}

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
  const child = logger.child({ module });
  return new Proxy(child, {
    get(target, property, receiver) {
      if (["fatal", "error", "warn", "info", "debug", "trace"].includes(String(property))) {
        return (context: unknown, message?: string) => {
          if (typeof context === "string") return Reflect.get(target, property, receiver)(context);
          return Reflect.get(target, property, receiver)(redact(context), message);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}
