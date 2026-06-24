import { z } from "zod";

const boolString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const optionalUrl = z.union([z.literal(""), z.string().url()]).default("");

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z.string().min(1),
    BYBIT_API_KEY: z.string().default(""),
    BYBIT_API_SECRET: z.string().default(""),
    BYBIT_TESTNET: boolString.default("true"),
    PAPER_TRADING: boolString.default("true"),
    TRADING_SYMBOL: z.string().regex(/^[A-Z0-9]+$/).default("BTCUSDT"),
    TRADING_LEVERAGE_MAX: z.coerce.number().int().min(1).max(10).default(5),
    TRADING_POSITION_MAX_USDT: z.coerce.number().positive().default(500),
    DAILY_LOSS_LIMIT_USDT: z.coerce.number().positive().default(50),
    MAX_DRAWDOWN_PCT: z.coerce.number().min(1).max(50).default(8),
    MIN_SIGNAL_SCORE: z.coerce.number().min(55).max(85).default(65),
    SPREAD_MAX_PCT: z.coerce.number().positive().max(1).default(0.05),
    TELEGRAM_BOT_TOKEN: z.string().default(""),
    TELEGRAM_CHAT_ID: z.string().default(""),
    DISCORD_WEBHOOK_TRADES: optionalUrl,
    DISCORD_WEBHOOK_ALERTS: optionalUrl,
    DISCORD_WEBHOOK_DAILY: optionalUrl,
    DASHBOARD_PASSWORD: z.string().min(8),
    JWT_SECRET: z.string().min(32),
    VITE_API_URL: z.string().url().default("http://localhost:3000"),
    API_ORIGIN: z.string().url().default("http://localhost:5173"),
  })
  .superRefine((env, ctx) => {
    if (!env.PAPER_TRADING && (!env.BYBIT_API_KEY || !env.BYBIT_API_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Live trading requires BYBIT_API_KEY and BYBIT_API_SECRET",
        path: ["BYBIT_API_KEY"],
      });
    }
    if (!env.PAPER_TRADING && env.BYBIT_TESTNET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set PAPER_TRADING=true for simulations; live execution on testnet must be explicit",
        path: ["PAPER_TRADING"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  cached ??= envSchema.parse(source);
  return cached;
}
