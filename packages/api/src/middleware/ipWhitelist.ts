import type { RequestHandler } from "express";
import { getEnv, moduleLogger, prisma } from "@obsidra/shared";

const log = moduleLogger("IpWhitelist");

export const ipWhitelist: RequestHandler = (request, response, next) => {
  const allowed = getEnv().ALLOWED_IPS.split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowed.length) return next();
  const ip = request.ip?.replace("::ffff:", "") ?? "";
  if (allowed.includes(ip) || ip.startsWith("10.") || ip.startsWith("100.64.")) return next();
  log.warn({ ip, path: request.path }, "IP rejected");
  void prisma.auditLog.create({ data: { action: "IP_REJECTED", actor: "system", details: { path: request.path }, ipAddress: ip } });
  response.status(403).json({ error: "Forbidden" });
};
