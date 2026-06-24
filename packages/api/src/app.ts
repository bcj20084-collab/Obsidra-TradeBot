import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { compare } from "bcryptjs";
import { getEnv } from "@obsidra/shared";
import { clearSession, createSession, readSession } from "./auth/session.js";
import { appRouter } from "./routers/index.js";
import { createContext } from "./trpc.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: env.API_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  app.get("/health", (_request, response) => response.json({ ok: true }));
  app.get("/auth/session", (request, response) => response.json({ authenticated: Boolean(readSession(request)) }));
  app.post("/auth/login", async (request, response) => {
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const expected = env.DASHBOARD_PASSWORD;
    const valid = expected.startsWith("$2") ? await compare(password, expected) : constantTimeEqual(password, expected);
    if (!valid) {
      response.status(401).json({ error: "Invalid credentials" });
      return;
    }
    createSession(response);
    response.json({ ok: true });
  });
  app.post("/auth/logout", (_request, response) => {
    clearSession(response);
    response.json({ ok: true });
  });
  app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index++) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return mismatch === 0;
}
