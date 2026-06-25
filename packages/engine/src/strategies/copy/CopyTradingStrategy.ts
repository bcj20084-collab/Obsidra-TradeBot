import { moduleLogger, prisma, type SignalResult } from "@obsidra/shared";
import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
import type { StrategyDependencies } from "../StrategyFactory.js";
import { scaleCopyPosition } from "./CopyRiskScaler.js";
import { HttpCopyPositionSource, type CopySourcePosition } from "./CopyPositionSource.js";

const log = moduleLogger("CopyTradingStrategy");

export class CopyTradingStrategy extends BaseStrategy {
  private timer: NodeJS.Timeout | undefined;
  private readonly previous = new Map<string, CopySourcePosition[]>();
  private readonly source: HttpCopyPositionSource;
  private polling = false;

  constructor(config: ConstructorParameters<typeof BaseStrategy>[0], private readonly dependencies: StrategyDependencies) {
    super(config);
    this.source = new HttpCopyPositionSource(String(config.params.positionFeedUrl ?? ""));
  }

  override async start(): Promise<void> {
    await super.start();
    if (!this.config.params.positionFeedUrl) {
      this.pause();
      log.warn({ strategyId: this.config.id }, "copy strategy paused: no authorized position feed configured");
      return;
    }
    const interval = Math.max(2_000, Number(this.config.params.pollIntervalMs ?? 5_000));
    this.timer = setInterval(() => void this.pollTraders(), interval);
    this.timer.unref();
    await this.pollTraders();
  }

  async onCandle(_candle: OHLCVCandle): Promise<void> {}

  override async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await super.stop();
  }

  private async pollTraders(): Promise<void> {
    if (this.polling || !["RUNNING", "PAPER"].includes(this.metrics.status)) return;
    this.polling = true;
    try {
      const traderIds = Array.isArray(this.config.params.traderIds) ? this.config.params.traderIds.map(String) : [];
      for (const traderId of traderIds) {
        const current = await this.source.getPositions(traderId);
        const previous = this.previous.get(traderId) ?? [];
        for (const position of current) {
          if (!previous.some((old) => this.key(old) === this.key(position))) await this.handleNewPosition(traderId, position);
        }
        for (const position of previous) {
          if (!current.some((next) => this.key(next) === this.key(position))) await this.handleClosedPosition(traderId, position);
        }
        this.previous.set(traderId, current);
      }
    } catch (error) {
      log.error({ error, strategyId: this.config.id }, "copy position polling failed");
    } finally {
      this.polling = false;
    }
  }

  private async handleNewPosition(traderId: string, position: CopySourcePosition): Promise<void> {
    const existing = await prisma.copyTraderPosition.findFirst({
      where: { traderId, symbol: position.symbol, direction: position.direction, closedAt: null },
    });
    if (existing) return;
    const detected = await prisma.copyTraderPosition.create({
      data: {
        traderId,
        symbol: position.symbol,
        direction: position.direction,
        size: position.size,
        entryPrice: position.entryPrice,
        leverage: position.leverage,
        detectedAt: new Date(),
      },
    });
    const scaled = scaleCopyPosition(
      position.size,
      position.entryPrice,
      Number(this.config.params.ratioPct ?? 10),
      this.config.maxPositionUsdt,
      position.leverage,
      Number(this.config.params.maxLeverage ?? 5),
    );
    const riskEngine = this.dependencies.riskForSymbol(position.symbol, this.config.exchange);
    if (!riskEngine) {
      await prisma.copyTraderPosition.update({ where: { id: detected.id }, data: { skippedReason: "No risk engine configured for symbol" } });
      return;
    }
    const stopDistance = Number(this.config.params.fallbackStopLossPct ?? 2) / 100;
    const signal: SignalResult = {
      symbol: position.symbol,
      direction: position.direction,
      score: 100,
      entryPrice: position.entryPrice,
      stopLoss: position.direction === "LONG" ? position.entryPrice * (1 - stopDistance) : position.entryPrice * (1 + stopDistance),
      takeProfit: position.direction === "LONG" ? position.entryPrice * (1 + stopDistance * 2) : position.entryPrice * (1 - stopDistance * 2),
      confidence: 1,
      indicators: { atr: position.entryPrice * stopDistance },
      mlAdjustment: 0,
      regime: "NORMAL",
      timestamp: Date.now(),
    };
    const risk = await riskEngine.approve(position.symbol, signal);
    if (!risk.approved) {
      await prisma.copyTraderPosition.update({ where: { id: detected.id }, data: { skippedReason: risk.reason ?? "Risk rejected" } });
      return;
    }
    const copyRisk = { ...risk, positionSizeUsdt: Math.min(risk.positionSizeUsdt, scaled.positionUsdt), leverage: Math.min(risk.leverage, scaled.leverage) };
    const portfolioApproval = await this.dependencies.approveOrder(this.config, position.direction, copyRisk.positionSizeUsdt, position.symbol);
    if (!portfolioApproval.approved) {
      await prisma.copyTraderPosition.update({ where: { id: detected.id }, data: { skippedReason: portfolioApproval.reason ?? "Portfolio risk rejected" } });
      return;
    }
    const tradeId = await this.dependencies.orderManager.execute(position.symbol, signal, copyRisk, this.config.exchange, this.config.id);
    this.dependencies.registerOpen(this.config, position.direction, copyRisk.positionSizeUsdt, position.symbol);
    await prisma.copyTraderPosition.update({ where: { id: detected.id }, data: { ourTradeId: tradeId } });
  }

  private async handleClosedPosition(traderId: string, position: CopySourcePosition): Promise<void> {
    const mirrored = await prisma.copyTraderPosition.findFirst({
      where: { traderId, symbol: position.symbol, direction: position.direction, closedAt: null },
      orderBy: { detectedAt: "desc" },
    });
    if (!mirrored) return;
    if (mirrored.ourTradeId) {
      await this.dependencies.orderManager.close(mirrored.ourTradeId, "COPY_SOURCE_CLOSED");
      this.dependencies.unregisterOpen(this.config, position.symbol);
    }
    await prisma.copyTraderPosition.update({ where: { id: mirrored.id }, data: { closedAt: new Date() } });
    await this.dependencies.journal.record("COPY_POSITION_CLOSED", { traderId, symbol: position.symbol }, mirrored.ourTradeId ?? undefined);
  }

  private key(position: CopySourcePosition): string {
    return `${position.symbol}:${position.direction}`;
  }
}
