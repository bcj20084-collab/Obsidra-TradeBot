import { beforeAll, describe, expect, it } from "vitest";

let escapeTelegramHtml: typeof import("./TelegramNotifier.js").escapeTelegramHtml;
let formatSigned: typeof import("./TelegramNotifier.js").formatSigned;
let formatTelegramPrice: typeof import("./TelegramNotifier.js").formatTelegramPrice;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/obsidra";
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.DASHBOARD_PASSWORD = "test-password";
  ({ escapeTelegramHtml, formatSigned, formatTelegramPrice } = await import("./TelegramNotifier.js"));
});

describe("Telegram formatting", () => {
  it("escapes Telegram HTML", () => {
    expect(escapeTelegramHtml("<BTC & ETH>")).toBe("&lt;BTC &amp; ETH&gt;");
  });

  it("formats signed PnL", () => {
    expect(formatSigned(1.234)).toBe("+1.23");
    expect(formatSigned(-1.234)).toBe("-1.23");
  });

  it("uses useful precision for prices", () => {
    expect(formatTelegramPrice(60_000)).toBe("60000.00");
    expect(formatTelegramPrice(0.01234567)).toBe("0.012346");
  });
});
