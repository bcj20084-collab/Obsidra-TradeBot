import { describe, expect, it } from "vitest";
import { envSchema } from "./env.js";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/obsidra",
  DASHBOARD_PASSWORD: "safe-password",
  JWT_SECRET: "a".repeat(32),
  MASTER_SECRET: "b".repeat(32),
};

describe("live trading environment gate", () => {
  it("keeps paper trading as the safe default", () => {
    expect(envSchema.parse(base).PAPER_TRADING).toBe(true);
  });

  it("rejects live execution without an explicit real-money acknowledgement", () => {
    expect(() => envSchema.parse({
      ...base,
      NODE_ENV: "production",
      PAPER_TRADING: "false",
      TREND_PAPER_TRADING: "false",
      BYBIT_TESTNET: "false",
      BYBIT_API_KEY: "key",
      BYBIT_API_SECRET: "secret",
    })).toThrow(/LIVE_TRADING_CONFIRMATION/);
  });

  it("allows remote Demo Trading without the live-money acknowledgement", () => {
    const env = envSchema.parse({
      ...base,
      PAPER_TRADING: "false",
      TREND_PAPER_TRADING: "false",
      BYBIT_TESTNET: "false",
      BYBIT_DEMO: "true",
      BYBIT_API_KEY: "demo-key",
      BYBIT_API_SECRET: "demo-secret",
    });
    expect(env.BYBIT_DEMO).toBe(true);
  });

  it("rejects selecting Bybit Testnet and Demo simultaneously", () => {
    expect(() => envSchema.parse({
      ...base,
      BYBIT_TESTNET: "true",
      BYBIT_DEMO: "true",
    })).toThrow(/cannot both be true/);
  });

  it("allows the development MASTER_SECRET fallback outside production", () => {
    const { MASTER_SECRET: _masterSecret, ...withoutMasterSecret } = base;
    const env = envSchema.parse(withoutMasterSecret);
    expect(env.MASTER_SECRET).toBe("development-only-master-secret-32");
  });

  it("uses JWT_SECRET as a production-safe fallback when MASTER_SECRET is absent", () => {
    const { MASTER_SECRET: _masterSecret, ...withoutMasterSecret } = base;
    const env = envSchema.parse({
      ...withoutMasterSecret,
      NODE_ENV: "production",
    });
    expect(env.MASTER_SECRET).toBe(base.JWT_SECRET);
  });

  it("rejects the literal development MASTER_SECRET in production even when explicitly provided", () => {
    expect(() => envSchema.parse({
      ...base,
      NODE_ENV: "production",
      MASTER_SECRET: "development-only-master-secret-32",
    })).toThrow(/production MASTER_SECRET|development fallback/);
  });
});
