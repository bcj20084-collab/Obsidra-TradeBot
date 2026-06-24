import { z } from 'zod';

const boolFromString = z.union([z.boolean(), z.string()]).transform((value) => value === true || value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  BOT_VERSION: z.string().default('0.1.0'),
  DATABASE_URL: z.string().min(1),
  BYBIT_API_KEY: z.string().optional().default(''),
  BYBIT_API_SECRET: z.string().optional().default(''),
  BYBIT_TESTNET: boolFromString.default(true),
  PAPER_TRADING: boolFromString.default(true),
  TRADING_SYMBOL: z.string().default('BTCUSDT'),
  TRADING_LEVERAGE_MAX: z.coerce.number().int().min(1).max(10).default(5),
  TRADING_POSITION_MAX_USDT: z.coerce.number().positive().default(500),
  DAILY_LOSS_LIMIT_USDT: z.coerce.number().positive().default(50),
  MAX_DRAWDOWN_PCT: z.coerce.number().positive().max(50).default(8),
  MIN_SIGNAL_SCORE: z.coerce.number().int().min(55).max(85).default(65),
  SPREAD_MAX_PCT: z.coerce.number().positive().default(0.05),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  DISCORD_WEBHOOK_TRADES: z.string().optional().default(''),
  DISCORD_WEBHOOK_ALERTS: z.string().optional().default(''),
  DISCORD_WEBHOOK_DAILY: z.string().optional().default(''),
  DASHBOARD_PASSWORD: z.string().min(6).default('change-me'),
  JWT_SECRET: z.string().min(12).default('change-me-with-32-plus-random-chars'),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);

if (!env.PAPER_TRADING && (!env.BYBIT_API_KEY || !env.BYBIT_API_SECRET)) {
  throw new Error('Live trading requires BYBIT_API_KEY and BYBIT_API_SECRET. Keep PAPER_TRADING=true until ready.');
}
