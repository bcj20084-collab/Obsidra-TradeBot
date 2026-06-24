import type { RequestHandler } from "express";
import { getEnv, moduleLogger, prisma } from "@obsidra/shared";

const log = moduleLogger("IpWhitelist");

export const ipWhitelist: RequestHandler = (request, response, next) => {
  const allowed = getEnv().ALLOWED_IPS.split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowed.length) return next();
  const ip = normalizeIp(request.ip ?? "");
  if (isRailwayInternal(ip) || allowed.some((entry) => matchesIpEntry(ip, entry))) return next();
  log.warn({ ip, path: request.path }, "IP rejected");
  void prisma.auditLog.create({ data: { action: "IP_REJECTED", actor: "system", details: { path: request.path }, ipAddress: ip } }).catch(() => undefined);
  response.status(403).json({ error: "Forbidden" });
};

function normalizeIp(ip: string): string {
  return ip.replace("::ffff:", "").trim();
}

function isRailwayInternal(ip: string): boolean {
  return ip.startsWith("10.") || ip.startsWith("100.64.") || ip === "127.0.0.1" || ip === "::1";
}

function matchesIpEntry(ip: string, entry: string): boolean {
  if (!entry.includes("/")) return normalizeIp(entry) === ip;
  const [range, bitsRaw] = entry.split("/");
  const bits = Number(bitsRaw);
  if (!range || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipNumber = ipv4ToNumber(ip);
  const rangeNumber = ipv4ToNumber(range);
  if (ipNumber === null || rangeNumber === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNumber & mask) === (rangeNumber & mask);
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}
