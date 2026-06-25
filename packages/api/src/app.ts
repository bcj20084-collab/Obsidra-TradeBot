import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { compare } from "bcryptjs";
import { getEnv, prisma } from "@obsidra/shared";
import { clearSession, createSession, readSession } from "./auth/session.js";
import { ipWhitelist } from "./middleware/ipWhitelist.js";
import { clearLoginAttempts, loginRateLimiter } from "./middleware/rateLimiter.js";
import { appRouter } from "./routers/index.js";
import { createContext } from "./trpc.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.set({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    next();
  });
  app.use(cors({ origin: env.API_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.set("trust proxy", 1);
  app.use(ipWhitelist);

  app.get("/health", (_request, response) => response.json({
    ok: true,
    service: "obsidra-api",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
  app.get("/ready", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ ready: true });
    } catch {
      response.status(503).json({ ready: false });
    }
  });
  app.get("/auth/session", (request, response) => response.json({ authenticated: Boolean(readSession(request)) }));
  app.post("/auth/login", loginRateLimiter, async (request, response) => {
    const requestIp = request.ip ?? "unknown";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const expected = env.DASHBOARD_PASSWORD_HASH || env.DASHBOARD_PASSWORD;
    const valid = expected.startsWith("$2") ? await compare(password, expected) : constantTimeEqual(password, expected);
    if (!valid) {
      void prisma.auditLog.create({
        data: { action: "LOGIN_FAILED", actor: "dashboard", details: {}, ipAddress: requestIp },
      }).catch(() => undefined);
      response.status(401).json({ error: "Invalid credentials" });
      return;
    }
    clearLoginAttempts(requestIp);
    createSession(response);
    void prisma.auditLog.create({
      data: { action: "LOGIN_SUCCESS", actor: "dashboard", details: {}, ipAddress: requestIp },
    }).catch(() => undefined);
    response.json({ ok: true });
  });
  app.post("/auth/logout", (_request, response) => {
    clearSession(response);
    response.json({ ok: true });
  });
  app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  const dashboardDist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dashboard/dist",
  );
  app.use(express.static(dashboardDist));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(dashboardDist, "index.html"));
  });
  return app;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index++) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}
