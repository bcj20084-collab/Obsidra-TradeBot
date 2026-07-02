import type { RequestHandler } from "express";

// Railway currently runs this service as a single instance, so an in-memory limiter
// is sufficient. If the API is horizontally scaled, replace this Map with Redis or
// another shared store so login attempts are counted across replicas.
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
