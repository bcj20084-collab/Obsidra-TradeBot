import { moduleLogger, prisma, type SignalResult } from "@obsidra/shared";
import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
import type { StrategyDependencies } from "../StrategyFactory.js";
import { SCALP_MAX_LEVERAGE } from "./constants.js";
import { ScalpSignalEngine } from "./ScalpSignalEngine.js";

const log = moduleLogger("ScalpStrategy");

export class ScalpStrategy extends BaseStrategy {
  readonly maxLeverage = SCALP_MAX_LEVERAGE;
  private readonly signals = new ScalpSignalEngine();
  private readonly closeTimers = new Map<string, NodeJS.Timeout>();
  private processing = false;

  constructor(config: ConstructorParameters<typeof BaseStrategy>[0], private readonly dependencies?: StrategyDependencies) {
    super(config);
  }

  async onCandle(candle: OHLCVCandle): Promise<void> {
    if (!this.dependencies || !["RUNNING", "PAPER"].includes(this.metrics.status) || candle.interval !== "1" || this.processing) return;
    const hour = new Date(candle.openTime).getUTCHours();
    const hours = this.config.params.tradingHours as { start: number; end: number } | undefined;
    if (hours && (hour < hours.start || hour >= hours.end)) return;
    const signal = this.signals.evaluate(this.config.symbol, this.dependencies.storeFor(this.config.exchange));
    if (!signal) return;
    this.processing = true;
    try {
      const maxDailyTrades = Number(this.config.params.maxDailyTrades ?? 20);
      const day = new Date();
      day.setUTCHours(0, 0, 0, 0);
      const [dailyTrades, recentClosed] = await Promise.all([
        prisma.trade.count({ where: { strategyId: this.config.id, createdAt: { gte: day } } }),
        prisma.trade.findMany({ where: { strategyId: this.config.id, status: "CLOSED" }, orderBy: { closedAt: "desc" }, take: 3, select: { pnlUsdt: true } }),
      ]);
      if (dailyTrades >= maxDailyTrades || (recentClosed.length === 3 && recentClosed.every((trade) => (trade.pnlUsdt ?? 0) < 0))) {
        this.pause();
        log.warn({ strategyId: this.config.id }, "scalp circuit breaker opened");
        return;
      }
      const stopLoss = signal.direction === "LONG"
        ? signal.entryPrice * (1 - signal.stopLossPct / 100)
        : signal.entryPrice * (1 + signal.stopLossPct / 100);
      const takeProfit = signal.direction === "LONG"
        ? signal.entryPrice * (1 + signal.takeProfitPct / 100)
        : signal.entryPrice * (1 - signal.takeProfitPct / 100);
      const strategySignal: SignalResult = {
        symbol: this.config.symbol,
        direction: signal.direction,
        score: 100,
        entryPrice: signal.entryPrice,
        stopLoss,
        takeProfit,
        confidence: 1,
        indicators: { rsi: signal.rsi, atr: signal.entryPrice * signal.stopLossPct / 100 },
        mlAdjustment: 0,
        regime: "NORMAL",
        timestamp: Date.now(),
      };
      const riskEngine = this.dependencies.riskForSymbol(this.config.symbol, this.config.exchange);
      if (!riskEngine) {
        log.warn({ strategyId: this.config.id }, "scalp skipped because no risk engine is configured for symbol");
        return;
      }
      const risk = await riskEngine.approve(this.config.symbol, strategySignal);
      if (!risk.approved) return;
      const cappedRisk = { ...risk, leverage: Math.min(this.maxLeverage, risk.leverage) };
      const portfolioApproval = await this.dependencies.approveOrder(this.config, signal.direction, cappedRisk.positionSizeUsdt);
      if (!portfolioApproval.approved) return;
      const tradeId = await this.dependencies.orderManager.execute(this.config.symbol, strategySignal, cappedRisk, this.config.exchange, this.config.id);
      this.dependencies.registerOpen(this.config, signal.direction, cappedRisk.positionSizeUsdt);
      const timer = setTimeout(() => {
        this.closeTimers.delete(tradeId);
        void this.dependencies?.orderManager.close(tradeId, "SCALP_MAX_HOLD")
          .then(() => this.dependencies?.unregisterOpen(this.config))
          .catch((error) => log.error({ error, tradeId }, "scalp timed close failed"));
      }, 15 * 60 * 1_000);
      timer.unref();
      this.closeTimers.set(tradeId, timer);
    } finally {
      this.processing = false;
    }
  }

  override async stop(): Promise<void> {
    for (const timer of this.closeTimers.values()) clearTimeout(timer);
    this.closeTimers.clear();
    await super.stop();
  }
}
