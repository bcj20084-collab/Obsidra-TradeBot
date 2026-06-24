import pino from "pino";
import winston from "winston";
import { getEnv } from "./env.js";

const env = getEnv();

const sensitiveKeys = new Set(["apikey", "secret", "password", "token", "jwt", "authorization"]);
const pinoLogMethods = new Set(["fatal", "error", "warn", "info", "debug", "trace"]);

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
    get(target, property) {
      const value = Reflect.get(target, property, target);

      if (pinoLogMethods.has(String(property)) && typeof value === "function") {
        return (...args: unknown[]) => {
          if (args.length === 0 || typeof args[0] === "string") return value.call(target, ...args);
          const [context, ...rest] = args;
          return value.call(target, redact(context), ...rest);
        };
      }

      if (typeof value === "function") return value.bind(target);
      return value;
    },
  });
}
