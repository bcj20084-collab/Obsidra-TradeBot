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
});
