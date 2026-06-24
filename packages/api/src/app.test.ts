import { describe, expect, it } from "vitest";
import request from "supertest";

process.env.DATABASE_URL = "postgresql://unused";
process.env.DASHBOARD_PASSWORD = "correct-password";
process.env.JWT_SECRET = "12345678901234567890123456789012";

describe("API", async () => {
  const { createApp } = await import("./app.js");
  const app = createApp();

  it("exposes health", async () => {
    await request(app).get("/health").expect(200, { ok: true });
  });

  it("rejects bad login", async () => {
    await request(app).post("/auth/login").send({ password: "wrong" }).expect(401);
  });

  it("sets an httpOnly session cookie", async () => {
    const response = await request(app).post("/auth/login").send({ password: "correct-password" }).expect(200);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });
});
