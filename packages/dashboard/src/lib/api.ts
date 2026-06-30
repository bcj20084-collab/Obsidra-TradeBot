import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { DeepHealth } from "./types";

export const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

export const trpc = createTRPCUntypedClient({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      transformer: superjson,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});

export async function login(password: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error("Invalid credentials");
}

export async function hasSession(): Promise<boolean> {
  const response = await fetch(`${API_URL}/auth/session`, { credentials: "include" });
  return response.ok && Boolean((await response.json() as { authenticated: boolean }).authenticated);
}

export async function fetchDeepHealth(): Promise<DeepHealth> {
  const response = await fetch(`${API_URL}/health/deep`, { credentials: "include" });
  if (!response.ok) throw new Error("Deep health unavailable");
  return await response.json() as DeepHealth;
}
