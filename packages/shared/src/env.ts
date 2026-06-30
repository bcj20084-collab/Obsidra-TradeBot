import { z } from "zod";

const boolString = z
  .enum(["true", "false"])
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
    BYBIT_API_KEY_NEW: z.string().default(""),
    BYBIT_API_SECRET_NEW: z.string().default(""),
    BYBIT_TESTNET: boolString.default(true),
    BYBIT_DEMO: boolString.default(false),
    BYBIT_MAX_EXPOSURE_USDT: z.coerce.number().positive().default(1000),
    BINANCE_API_KEY: z.string().default(""),
    BINANCE_API_SECRET: z.string().default(""),
    BINANCE_TESTNET: boolString.default(true),
    BINANCE_MAX_EXPOSURE_USDT: z.coerce.number().positive().default(500),
    PAPER_TRADING: boolString.default(true),
    TRADING_SYMBOL: z.string().regex(/^[A-Z0-9]+$/).default("BTCUSDT"),
    TRADING_SYMBOLS: z.string().default("BTCUSDT"),
    TRADING_LEVERAGE_MAX: z.coerce.number().int().min(1).max(10).default(5),
    TRADING_POSITION_MAX_USDT: z.coerce.number().positive().default(500),
    PORTFOLIO_MAX_USDT: z.coerce.number().positive().default(800),
    PORTFOLIO_MAX_USDT_PER_SYMBOL: z.coerce.number().positive().default(600),
    MAX_OPEN_POSITIONS: z.coerce.number().int().min(1).max(5).default(2),
    MAX_OPEN_POSITIONS_TOTAL: z.coerce.number().int().min(1).max(20).default(5),
    TOTAL_DAILY_LOSS_LIMIT_USDT: z.coerce.number().positive().default(100),
    ALLOW_SAME_SYMBOL_HEDGE: boolString.default(false),
    MIN_POSITION_USDT: z.coerce.number().positive().default(10),
    DAILY_LOSS_LIMIT_USDT: z.coerce.number().positive().default(50),
    WEEKLY_LOSS_LIMIT_USDT: z.coerce.number().positive().default(150),
    MAX_DRAWDOWN_PCT: z.coerce.number().min(1).max(50).default(8),
    MAX_RISK_PER_TRADE_PCT: z.coerce.number().positive().max(2).default(0.5),
    MAX_CONSECUTIVE_LOSSES: z.coerce.number().int().min(1).max(10).default(3),
    LOSS_COOLDOWN_MINUTES: z.coerce.number().int().min(1).max(10_080).default(240),
    MIN_SIGNAL_SCORE: z.coerce.number().min(55).max(85).default(65),
    SPREAD_MAX_PCT: z.coerce.number().positive().max(1).default(0.05),
    PAPER_FEE_RATE: z.coerce.number().min(0).max(0.01).default(0.00055),
    PAPER_SLIPPAGE_BPS: z.coerce.number().min(0).max(100).default(2),
    ENGINE_LOG_HEARTBEAT_SECONDS: z.coerce.number().int().min(0).max(3600).default(300),
    PAPER_IDLE_RELAX_AFTER_HOURS: z.coerce.number().min(0).max(168).default(12),
    PAPER_IDLE_MAX_RELAX_SCORE: z.coerce.number().min(0).max(15).default(8),
    PAPER_IDLE_MIN_ADX: z.coerce.number().min(10).max(25).default(20),
    TELEGRAM_STATUS_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(30),
    LIVE_TRADING_CONFIRMATION: z.string().default(""),
    TELEGRAM_BOT_TOKEN: z.string().default(""),
    TELEGRAM_CHAT_ID: z.string().default(""),
    DISCORD_WEBHOOK_TRADES: optionalUrl,
    DISCORD_WEBHOOK_ALERTS: optionalUrl,
    DISCORD_WEBHOOK_DAILY: optionalUrl,
    DASHBOARD_PASSWORD: z.string().default(""),
    DASHBOARD_PASSWORD_HASH: z.string().default(""),
    JWT_SECRET: z.string().min(32),
    MASTER_SECRET: z.string().min(32).default("development-only-master-secret-32"),
    ALLOWED_IPS: z.string().default(""),
    STRATEGY_TREND_ENABLED: boolString.default(true),
    STRATEGY_GRID_ENABLED: boolString.default(false),
    STRATEGY_DCA_ENABLED: boolString.default(false),
    STRATEGY_SCALP_ENABLED: boolString.default(false),
    STRATEGY_COPY_ENABLED: boolString.default(false),
    TREND_SYMBOLS: z.string().default("BTCUSDT,ETHUSDT"),
    TREND_EXCHANGE: z.enum(["bybit", "binance"]).default("bybit"),
    TREND_PAPER_TRADING: boolString.default(true),
    GRID_SYMBOL: z.string().default("BTCUSDT"),
    GRID_EXCHANGE: z.enum(["bybit", "binance"]).default("binance"),
    GRID_UPPER_PRICE: z.coerce.number().positive().default(70_000),
    GRID_LOWER_PRICE: z.coerce.number().positive().default(60_000),
    GRID_COUNT: z.coerce.number().int().min(5).max(50).default(10),
    GRID_TOTAL_INVEST_USDT: z.coerce.number().positive().default(500),
    GRID_PAPER_TRADING: boolString.default(true),
    DCA_SYMBOL: z.string().default("ETHUSDT"),
    DCA_EXCHANGE: z.enum(["bybit", "binance"]).default("bybit"),
    DCA_DIRECTION: z.enum(["LONG", "SHORT"]).default("LONG"),
    DCA_BASE_ORDER_USDT: z.coerce.number().positive().default(50),
    DCA_SAFETY_ORDER_USDT: z.coerce.number().positive().default(100),
    DCA_SAFETY_ORDER_COUNT: z.coerce.number().int().min(0).max(20).default(5),
    DCA_PAPER_TRADING: boolString.default(true),
    SCALP_SYMBOL: z.string().default("BTCUSDT"),
    SCALP_EXCHANGE: z.enum(["bybit", "binance"]).default("bybit"),
    SCALP_PAPER_TRADING: boolString.default(true),
    COPY_TRADER_IDS: z.string().default(""),
    COPY_EXCHANGE: z.enum(["bybit", "binance"]).default("bybit"),
    COPY_RATIO_PCT: z.coerce.number().positive().max(100).default(10),
    COPY_MAX_SIZE_USDT: z.coerce.number().positive().default(200),
    COPY_POSITION_FEED_URL: optionalUrl,
    COPY_PAPER_TRADING: boolString.default(true),
    VITE_API_URL: z.string().url().default("http://localhost:3000"),
    API_ORIGIN: z.string().url().default("http://localhost:5173"),
  })
  .superRefine((env, ctx) => {
    const symbols = env.TRADING_SYMBOLS.split(",").map((symbol) => symbol.trim()).filter(Boolean);
    if (symbols.length === 0 || symbols.length > 5 || symbols.some((symbol) => !/^[A-Z0-9]+$/.test(symbol))) {
      ctx.addIssue({
        code: "custom",
        message: "TRADING_SYMBOLS must contain 1-5 comma-separated Bybit symbols",
        path: ["TRADING_SYMBOLS"],
      });
    }
    if (!env.DASHBOARD_PASSWORD_HASH && env.DASHBOARD_PASSWORD.length < 8) {
      ctx.addIssue({
        code: "custom",
        message: "Set DASHBOARD_PASSWORD_HASH or DASHBOARD_PASSWORD",
        path: ["DASHBOARD_PASSWORD_HASH"],
      });
    }
    if (env.GRID_LOWER_PRICE >= env.GRID_UPPER_PRICE) {
      ctx.addIssue({ code: "custom", message: "GRID_LOWER_PRICE must be below GRID_UPPER_PRICE", path: ["GRID_LOWER_PRICE"] });
    }
    const strategyModes = [
      [env.STRATEGY_TREND_ENABLED, env.TREND_EXCHANGE, env.TREND_PAPER_TRADING],
      [env.STRATEGY_GRID_ENABLED, env.GRID_EXCHANGE, env.GRID_PAPER_TRADING],
      [env.STRATEGY_DCA_ENABLED, env.DCA_EXCHANGE, env.DCA_PAPER_TRADING],
      [env.STRATEGY_SCALP_ENABLED, env.SCALP_EXCHANGE, env.SCALP_PAPER_TRADING],
      [env.STRATEGY_COPY_ENABLED, env.COPY_EXCHANGE, env.COPY_PAPER_TRADING],
    ] as const;
    const remoteBybit = strategyModes.some(([enabled, exchange, paper]) => enabled && exchange === "bybit" && !(env.PAPER_TRADING || paper));
    const liveBybit = remoteBybit && !env.BYBIT_TESTNET && !env.BYBIT_DEMO;
    const remoteBinance = strategyModes.some(([enabled, exchange, paper]) => enabled && exchange === "binance" && !(env.PAPER_TRADING || paper));
    const liveBinance = remoteBinance && !env.BINANCE_TESTNET;
    if (env.BYBIT_TESTNET && env.BYBIT_DEMO) {
      ctx.addIssue({ code: "custom", message: "BYBIT_TESTNET and BYBIT_DEMO cannot both be true", path: ["BYBIT_DEMO"] });
    }
    if (remoteBybit && (!(env.BYBIT_API_KEY_NEW || env.BYBIT_API_KEY) || !(env.BYBIT_API_SECRET_NEW || env.BYBIT_API_SECRET))) {
      ctx.addIssue({ code: "custom", message: "Remote Bybit execution requires API credentials", path: ["BYBIT_API_KEY"] });
    }
    if (remoteBinance && (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET)) {
      ctx.addIssue({ code: "custom", message: "Remote Binance execution requires API credentials", path: ["BINANCE_API_KEY"] });
    }
    if ((liveBybit || liveBinance) && env.NODE_ENV !== "production") {
      ctx.addIssue({ code: "custom", message: "Live trading requires NODE_ENV=production", path: ["NODE_ENV"] });
    }
    if ((liveBybit || liveBinance) && env.LIVE_TRADING_CONFIRMATION !== "I_ACCEPT_REAL_MONEY_RISK") {
      ctx.addIssue({
        code: "custom",
        message: "Live trading requires LIVE_TRADING_CONFIRMATION=I_ACCEPT_REAL_MONEY_RISK",
        path: ["LIVE_TRADING_CONFIRMATION"],
      });
    }
    for (const exchange of ["bybit", "binance"] as const) {
      const modes = new Set(strategyModes.filter(([enabled, candidate]) => enabled && candidate === exchange).map(([, , paper]) => env.PAPER_TRADING || paper));
      if (modes.size > 1) {
        ctx.addIssue({ code: "custom", message: `Enabled ${exchange} strategies must use the same paper/live mode`, path: ["STRATEGY_TREND_ENABLED"] });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function tradingSymbols(env: Env): string[] {
  return [...new Set(env.TRADING_SYMBOLS.split(",").map((symbol) => symbol.trim()).filter(Boolean))];
}

let cached: Env | undefined;

export function getEnv(source: NodeJS.ProcessEnv = process.env): Env {
  cached ??= envSchema.parse(source);
  return cached;
}
