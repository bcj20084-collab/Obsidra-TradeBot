import type { RequestHandler } from "express";

const attempts = new Map<string, number[]>();

export const loginRateLimiter: RequestHandler = (request, response, next) => {
  const key = request.ip ?? "unknown";
  const cutoff = Date.now() - 15 * 60_000;
  const recent = (attempts.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= 5) {
    response.status(429).json({ error: "Too many login attempts" });
    return;
  }
  recent.push(Date.now());
  attempts.set(key, recent);
  next();
};

export function clearLoginAttempts(ip: string): void {
  attempts.delete(ip);
}
