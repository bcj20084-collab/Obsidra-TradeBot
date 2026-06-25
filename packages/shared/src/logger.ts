import pino from "pino";
import winston from "winston";
import { getEnv } from "./env.js";

const env = getEnv();

const sensitiveKeys = new Set([
  "apikey",
  "apisecret",
  "authorization",
  "cookie",
  "jwt",
  "mastersecret",
  "password",
  "privatekey",
  "secret",
  "secretkey",
  "session",
  "token",
]);
const pinoLogMethods = new Set(["fatal", "error", "warn", "info", "debug", "trace"]);

export type PremiumLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";
export type PremiumLogContext = Record<string, unknown>;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return [...sensitiveKeys].some((sensitive) => normalized === sensitive || normalized.includes(sensitive));
}

function redact(value: unknown, key = ""): unknown {
  if (isSensitiveKey(key)) return "[REDACTED]";
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  }
  if (typeof value === "string" && /^[A-Za-z0-9+/=_-]{32,}$/.test(value)) return "[REDACTED]";
  return value;
}

function compactStrings(entries: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value && value.length > 0)) as Record<string, string>;
}

function railwayContext(): Record<string, string> {
  return compactStrings({
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
    environmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
    projectId: process.env.RAILWAY_PROJECT_ID,
    publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
    serviceId: process.env.RAILWAY_SERVICE_ID,
    serviceName: process.env.RAILWAY_SERVICE_NAME,
    staticUrl: process.env.RAILWAY_STATIC_URL,
  });
}

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    app: "obsidra-tradebot",
    environment: env.NODE_ENV,
    service: "obsidra",
    railway: railwayContext(),
  },
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

export function premiumLog(
  module: string,
  event: string,
  context: PremiumLogContext = {},
  level: PremiumLogLevel = "info",
  message = `premium:${event}`,
): void {
  const child = moduleLogger(module);
  const payload = {
    premium: true,
    logTier: "premium",
    marker: "OBSIDRA_PREMIUM_LOG",
    event,
    ...context,
    railway: railwayContext(),
    uptimeSeconds: Math.floor(process.uptime()),
  };

  switch (level) {
    case "fatal":
      child.fatal(payload, message);
      break;
    case "error":
      child.error(payload, message);
      break;
    case "warn":
      child.warn(payload, message);
      break;
    case "debug":
      child.debug(payload, message);
      break;
    case "trace":
      child.trace(payload, message);
      break;
    default:
      child.info(payload, message);
  }
}
