import pino from "pino";
import winston from "winston";
import { getEnv } from "./env.js";

const env = getEnv();
const plainRuntimeLogs = env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT_ID);

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
export type OperatorLogLevel = "INFO" | "WARNING" | "ERROR";

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

function cleanOperatorText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatOperatorLine(level: OperatorLogLevel, label: string, details = ""): string {
  const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
  const safeLabel = cleanOperatorText(label);
  const safeDetails = cleanOperatorText(details);
  return `${timestamp} | ${level.padEnd(7)} | ${safeLabel}${safeDetails ? ` | ${safeDetails}` : ""}`;
}

export function operatorLog(level: OperatorLogLevel, label: string, details = ""): void {
  const stream = level === "ERROR" ? process.stderr : process.stdout;
  stream.write(`${formatOperatorLine(level, label, details)}\n`);
}

export function operatorBlock(title: string, rows: Array<[string, unknown]>): void {
  const separator = "=".repeat(72);
  const lines = [
    separator,
    formatOperatorLine("INFO", title),
    ...rows.map(([label, value]) => `${cleanOperatorText(label).padEnd(22)} | ${cleanOperatorText(value)}`),
    separator,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
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
    replicaRegion: process.env.RAILWAY_REPLICA_REGION,
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
          if (plainRuntimeLogs) {
            writePlainModuleLog(module, String(property).toUpperCase(), args);
            return undefined;
          }
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

function errorSummary(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = record.error ?? record.err;
    const context = candidate && typeof candidate === "object" && "context" in candidate
      ? (candidate as { context?: unknown }).context
      : undefined;
    const errorContext = context && typeof context === "object" ? context as Record<string, unknown> : {};
    const details = [
      typeof record.credentialSource === "string" ? `credential=${record.credentialSource}` : "",
      typeof errorContext.credentialSource === "string" ? `credential=${errorContext.credentialSource}` : "",
      typeof record.httpStatus === "number" ? `http=${record.httpStatus}` : "",
      typeof errorContext.httpStatus === "number" ? `http=${errorContext.httpStatus}` : "",
      typeof record.hasFallback === "boolean" ? `fallback=${record.hasFallback ? "yes" : "no"}` : "",
      typeof record.path === "string" ? `path=${record.path}` : "",
      typeof record.bybitHost === "string" ? `host=${record.bybitHost}` : "",
      typeof errorContext.bybitHost === "string" ? `host=${errorContext.bybitHost}` : "",
      typeof record.credentialKeyLength === "number" ? `keyLength=${record.credentialKeyLength}` : "",
      typeof errorContext.credentialKeyLength === "number" ? `keyLength=${errorContext.credentialKeyLength}` : "",
      typeof record.credentialKeyFingerprint === "string" ? `keyFingerprint=${record.credentialKeyFingerprint}` : "",
      typeof errorContext.credentialKeyFingerprint === "string" ? `keyFingerprint=${errorContext.credentialKeyFingerprint}` : "",
      typeof record.timestampOffsetMs === "number" ? `timeOffsetMs=${record.timestampOffsetMs}` : "",
      typeof errorContext.timestampOffsetMs === "number" ? `timeOffsetMs=${errorContext.timestampOffsetMs}` : "",
    ].filter(Boolean);
    const message = candidate instanceof Error
      ? candidate.message
      : candidate && typeof candidate === "object" && "message" in candidate
        ? cleanOperatorText((candidate as { message?: unknown }).message)
        : typeof record.reason === "string"
          ? record.reason
          : "";
    const hint = typeof record.authHint === "string" ? record.authHint : typeof errorContext.authHint === "string" ? errorContext.authHint : "";
    return [...details, message, hint].filter(Boolean).join(" | ");
  }
  return "";
}

function compactPrimitive(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) && value.length <= 6 && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
    return value.map((item) => compactPrimitive(item)).filter(Boolean).join(",");
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.round(value * 10_000) / 10_000) : "n/a";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return cleanOperatorText(value).slice(0, 140);
  if (value === null) return "null";
  return "";
}

function premiumSummary(context: PremiumLogContext): string {
  const redacted = redact(context);
  if (!redacted || typeof redacted !== "object") return "";
  const record = redacted as Record<string, unknown>;
  const preferred = [
    "outcome",
    "status",
    "stage",
    "exchange",
    "symbol",
    "symbols",
    "direction",
    "score",
    "confidence",
    "reason",
    "mode",
    "executionMode",
    "entryPrice",
    "exitPrice",
    "stopLoss",
    "takeProfit",
    "positionSizeUsdt",
    "leverage",
    "profitR",
    "price",
    "edgeScore",
    "riskReward",
    "marketRegime",
    "totalPnlUsdt",
    "pnlUsdt",
    "pnlPct",
    "winRate",
    "profitFactor",
    "totalTrades",
    "tradesLast24h",
    "signalsGenerated24h",
    "signalsRejected24h",
    "openPositionsCount",
    "totalExposureUsdt",
    "currentDrawdown",
    "uptimeSeconds",
    "port",
    "intervalSeconds",
    "liveConnections",
  ];
  const pairs: string[] = [];
  for (const key of preferred) {
    if (!(key in record)) continue;
    const value = compactPrimitive(record[key]);
    if (value) pairs.push(`${key}=${value}`);
  }
  for (const [key, raw] of Object.entries(record)) {
    if (pairs.length >= 12) break;
    if (preferred.includes(key) || key === "railway" || key === "premium" || key === "logTier" || key === "marker") continue;
    const value = compactPrimitive(raw);
    if (value) pairs.push(`${key}=${value}`);
  }
  const error = errorSummary(redacted);
  if (error) pairs.push(`error=${error.slice(0, 220)}`);
  return pairs.join(" | ");
}

function writePlainModuleLog(module: string, level: string, args: unknown[]): void {
  const stream = ["FATAL", "ERROR", "WARN"].includes(level) ? process.stderr : process.stdout;
  const message = typeof args[0] === "string"
    ? args[0]
    : typeof args[1] === "string"
      ? args[1]
      : "log";
  const extra = args.find((arg) => arg && typeof arg === "object");
  const redacted = redact(extra);
  const summary = premiumSummary(redacted && typeof redacted === "object" ? redacted as PremiumLogContext : {});
  const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
  const normalizedLevel = level === "WARN" ? "WARNING" : level;
  const line = `${timestamp} | ${normalizedLevel.padEnd(7)} | ${cleanOperatorText(module)} | ${cleanOperatorText(message)}${summary ? ` | ${summary}` : ""}`;
  stream.write(`${line}\n`);
}

export function premiumLog(
  module: string,
  event: string,
  context: PremiumLogContext = {},
  level: PremiumLogLevel = "info",
  message = `premium:${event}`,
): void {
  if (plainRuntimeLogs) {
    const operatorLevel: OperatorLogLevel = ["fatal", "error"].includes(level)
      ? "ERROR"
      : level === "warn"
        ? "WARNING"
        : "INFO";
    const summary = premiumSummary({ ...context, uptimeSeconds: Math.floor(process.uptime()) });
    operatorLog(operatorLevel, `${module.toUpperCase()} | ${event}`, summary || message);
    return;
  }

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
