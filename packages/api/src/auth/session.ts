import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "@obsidra/shared";

const COOKIE_NAME = "obsidra_session";

export interface Session {
  sub: "dashboard";
}

export function createSession(response: Response): void {
  const env = getEnv();
  const token = jwt.sign({ sub: "dashboard" } satisfies Session, env.JWT_SECRET, { expiresIn: "7d" });
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 86_400_000,
    path: "/",
  });
}

export function clearSession(response: Response): void {
  response.clearCookie(COOKIE_NAME, { path: "/" });
}

export function readSession(request: Request): Session | null {
  const token = request.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return null;
  try {
    return jwt.verify(token, getEnv().JWT_SECRET) as Session;
  } catch {
    return null;
  }
}
