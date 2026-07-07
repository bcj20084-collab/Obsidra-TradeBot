import { randomUUID } from "node:crypto";
import { moduleLogger, prisma } from "@obsidra/shared";
import type { OHLCVCandle, OrderResult } from "../../exchanges/IExchangeAdapter.js";
import type { ExchangeRouter } from "../../exchanges/ExchangeRouter.js";
import { BaseStrategy } from "../BaseStrategy.js";
import type { StrategyDependencies } from "../StrategyFactory.js";

const log = moduleLogger("DCAStrategy");

interface DcaFill {
  exchangeOrderId: string;
  fillPrice: number;
  filledQty: number;
  feeUsdt: number;
  investedUsdt: number;
}

export class DCAStrategy extends BaseStrategy {
  private positionId: string | undefined;
  private lastOrderPrice: number | undefined;
  private safetyOrders = 0;
  private processing = false;

  constructor(
    config: ConstructorParameters<typeof BaseStrategy>[0],
    private readonly exchanges: ExchangeRouter,
    private readonly dependencies?: StrategyDependencies,
  ) {
    super(config);
  }

  override async start(): Promise<void> {
    await super.start();
    const existing = await prisma.dCAPosition.findFirst({
      where: { strategyId: this.config.id, status: { in: ["WAITING", "ACTIVE", "COOLDOWN"] } },
      orderBy: { updatedAt: "desc" },
    });
    if (existing?.status === "COOLDOWN" && existing.cooldownEndsAt && existing.cooldownEndsAt <= new Date()) {
      await prisma.dCAPosition.update({ where: { id: existing.id }, data: { status: "COMPLETED" } });
    }
    const position = existing?.status === "COOLDOWN" && existing.cooldownEndsAt && existing.cooldownEndsAt <= new Date()
      ? await this.createWaitingPosition()
      : existing ?? await this.createWaitingPosition();
    this.positionId = position.id;
    this.lastOrderPrice = position.status === "COOLDOWN" ? undefined : position.averageEntryPrice ?? undefined;
    this.safetyOrders = position.status === "COOLDOWN" ? 0 : position.safetyOrdersFilled;
  }

  private createWaitingPosition() {
    return prisma.dCAPosition.create({
      data: {
        strategyId: this.config.id,
        symbol: this.config.symbol,
        exchange: this.config.exchange,
        direction: String(this.config.params.direction ?? "LONG"),
        status: "WAITING",
      },
    });
  }

  async onCandle(candle: OHLCVCandle): Promise<void> {
    if (this.processing || !["RUNNING", "PAPER"].includes(this.metrics.status)) return;
    this.processing = true;
    try {
      await this.processCandle(candle);
    } finally {
      this.processing = false;
    }
  }

  private async processCandle(candle: OHLCVCandle): Promise<void> {
    if (!this.positionId) await this.start();
    if (!this.positionId) return;
    const params = this.config.params;
    const direction = String(params.direction ?? "LONG");
    const persisted = await prisma.dCAPosition.findUniqueOrThrow({ where: { id: this.positionId } });
    if (persisted.status === "COOLDOWN") {
      if (!persisted.cooldownEndsAt || persisted.cooldownEndsAt > new Date()) return;
      await prisma.dCAPosition.update({ where: { id: persisted.id }, data: { status: "COMPLETED" } });
      const next = await this.createWaitingPosition();
      this.positionId = next.id;
      this.lastOrderPrice = undefined;
      this.safetyOrders = 0;
      return;
    }
    if (persisted.totalQty > 0 && await this.tryCloseCycle(candle.close, persisted, direction)) return;
    if (!this.lastOrderPrice) {
      const baseOrderUsdt = Number(params.baseOrderUsdt ?? 50);
      const approval = await this.dependencies?.approveOrder(this.config, direction as "LONG" | "SHORT", baseOrderUsdt);
      if (approval && !approval.approved) {
        log.warn({ strategyId: this.config.id, reason: approval.reason }, "DCA base order rejected");
        return;
      }
      const targetProfitPct = Number(params.targetProfitPct ?? 1.5) / 100;
      const stopLossPct = Number(params.stopLossPct ?? 10) / 100;
      let fill: DcaFill;
      try {
        fill = await this.placeOrder(candle.close, baseOrderUsdt, direction, "base", this.positionId);
      } catch (error) {
        await prisma.dCAPosition.update({
          where: { id: this.positionId },
          data: { status: "WAITING", averageEntryPrice: null, totalQty: 0, totalInvestedUsdt: 0, cycleStartedAt: null },
        });
        this.pause();
        throw error;
      }
      await prisma.dCAPosition.update({
        where: { id: this.positionId },
        data: {
          status: "ACTIVE",
          averageEntryPrice: fill.fillPrice,
          totalQty: fill.filledQty,
          totalInvestedUsdt: fill.investedUsdt,
          targetPrice: direction === "LONG" ? fill.fillPrice * (1 + targetProfitPct) : fill.fillPrice * (1 - targetProfitPct),
          stopLossPrice: direction === "LONG" ? fill.fillPrice * (1 - stopLossPct) : fill.fillPrice * (1 + stopLossPct),
          cycleStartedAt: new Date(),
        },
      });
      this.dependencies?.registerOpen(this.config, direction as "LONG" | "SHORT", baseOrderUsdt);
      this.lastOrderPrice = fill.fillPrice;
      return;
    }
    const safetyOrderCount = Number(params.safetyOrderCount ?? 5);
    if (this.safetyOrders >= safetyOrderCount) {
      await prisma.dCAPosition.update({ where: { id: this.positionId }, data: { status: "WAITING" } });
      log.warn({ strategyId: this.config.id, safetyOrders: this.safetyOrders }, "DCA safety-order limit reached");
      return;
    }
    const deviationPct = Number(params.priceDeviationPct ?? 2);
    const belowForLong = direction === "LONG" && candle.close <= this.lastOrderPrice * (1 - deviationPct / 100);
    const aboveForShort = direction === "SHORT" && candle.close >= this.lastOrderPrice * (1 + deviationPct / 100);
    if (!belowForLong && !aboveForShort) return;
    const safetyOrderUsdt = Number(params.safetyOrderUsdt ?? 100);
    const approval = await this.dependencies?.approveOrder(this.config, direction as "LONG" | "SHORT", safetyOrderUsdt);
    if (approval && !approval.approved) {
      log.warn({ strategyId: this.config.id, reason: approval.reason }, "DCA safety order rejected");
      return;
    }
    const current = await prisma.dCAPosition.findUniqueOrThrow({ where: { id: this.positionId } });
    const targetProfitPct = Number(params.targetProfitPct ?? 1.5) / 100;
    const stopLossPct = Number(params.stopLossPct ?? 10) / 100;
    await prisma.journalEntry.create({
      data: {
        type: "DCA_SAFETY_ORDER_INTENT",
        data: { strategyId: this.config.id, positionId: this.positionId, price: candle.close, sizeUsdt: safetyOrderUsdt, nextSafetyOrder: this.safetyOrders + 1 },
      },
    });
    let fill: DcaFill;
    try {
      fill = await this.placeOrder(candle.close, safetyOrderUsdt, direction, `safety-${this.safetyOrders + 1}`, this.positionId);
    } catch (error) {
      await prisma.dCAPosition.update({
        where: { id: this.positionId },
        data: {
          status: "WAITING",
          safetyOrdersFilled: current.safetyOrdersFilled,
          averageEntryPrice: current.averageEntryPrice,
          totalQty: current.totalQty,
          totalInvestedUsdt: current.totalInvestedUsdt,
        },
      });
      this.pause();
      throw error;
    }
    const totalQty = current.totalQty + fill.filledQty;
    const totalInvestedUsdt = current.totalInvestedUsdt + fill.investedUsdt;
    const averageEntryPrice = totalQty > 0 ? totalInvestedUsdt / totalQty : fill.fillPrice;
    await prisma.dCAPosition.update({
      where: { id: this.positionId },
      data: {
        status: "ACTIVE",
        safetyOrdersFilled: { increment: 1 },
        averageEntryPrice,
        totalQty,
        totalInvestedUsdt,
        targetPrice: direction === "LONG" ? averageEntryPrice * (1 + targetProfitPct) : averageEntryPrice * (1 - targetProfitPct),
        stopLossPrice: direction === "LONG" ? averageEntryPrice * (1 - stopLossPct) : averageEntryPrice * (1 + stopLossPct),
      },
    });
    this.safetyOrders += 1;
    this.dependencies?.registerOpen(this.config, direction as "LONG" | "SHORT", safetyOrderUsdt);
    this.lastOrderPrice = fill.fillPrice;
  }

  private async placeOrder(price: number, sizeUsdt: number, direction: string, suffix: string, positionId: string): Promise<DcaFill> {
    const result = await this.exchanges.placeOrder(this.config.exchange, {
      symbol: this.config.symbol,
      side: direction === "SHORT" ? "Sell" : "Buy",
      orderType: "Market",
      qty: Number((sizeUsdt / price).toFixed(6)),
      clientOrderId: `dca-${suffix}-${randomUUID()}`.slice(0, 36),
    });
    const fill = dcaFillFromOrderResult(result, price, sizeUsdt);
    await prisma.journalEntry.create({
      data: {
        type: "DCA_ORDER_PLACED",
        data: {
          strategyId: this.config.id,
          positionId,
          exchangeOrderId: result.exchangeOrderId,
          intendedPrice: price,
          intendedSizeUsdt: sizeUsdt,
          avgFillPrice: fill.fillPrice,
          filledQty: fill.filledQty,
          filledNotionalUsdt: fill.investedUsdt,
          feeUsdt: fill.feeUsdt,
        },
      },
    });
    return fill;
  }

  private async tryCloseCycle(
    price: number,
    position: { id: string; totalQty: number; averageEntryPrice: number | null; targetPrice: number | null; stopLossPrice: number | null; cycleStartedAt?: Date | null },
    direction: string,
  ): Promise<boolean> {
    const targetHit = position.targetPrice !== null && (direction === "LONG" ? price >= position.targetPrice : price <= position.targetPrice);
    const stopHit = position.stopLossPrice !== null && (direction === "LONG" ? price <= position.stopLossPrice : price >= position.stopLossPrice);
    if (!targetHit && !stopHit) return false;
    const reason = targetHit ? "TAKE_PROFIT" : "STOP_LOSS";
    await prisma.$transaction([
      prisma.dCAPosition.update({ where: { id: position.id }, data: { status: "CLOSING" } }),
      prisma.journalEntry.create({ data: { type: "DCA_CLOSE_INTENT", data: { strategyId: this.config.id, price, reason } } }),
    ]);
    try {
      const result = await this.exchanges.placeOrder(this.config.exchange, {
        symbol: this.config.symbol,
        side: direction === "LONG" ? "Sell" : "Buy",
        orderType: "Market",
        qty: Number(position.totalQty.toFixed(6)),
        reduceOnly: true,
        clientOrderId: `dca-close-${randomUUID()}`.slice(0, 36),
      });
      const closeFill = dcaFillFromOrderResult(result, price, Math.max(0, (position.averageEntryPrice ?? price) * position.totalQty));
      const entry = position.averageEntryPrice ?? closeFill.fillPrice;
      const closedQty = closeFill.filledQty || position.totalQty;
      const grossPnl = direction === "LONG" ? (closeFill.fillPrice - entry) * closedQty : (entry - closeFill.fillPrice) * closedQty;
      const entryFees = await this.entryFeesForPosition(position.id, position.cycleStartedAt ?? null);
      const pnl = grossPnl - entryFees - closeFill.feeUsdt;
      const cooldownMinutes = Number(this.config.params.cooldownMinutes ?? 60);
      await prisma.dCAPosition.update({
        where: { id: position.id },
        data: {
          status: "COOLDOWN",
          cycleClosedAt: new Date(),
          cyclePnlUsdt: pnl,
          cooldownEndsAt: new Date(Date.now() + cooldownMinutes * 60_000),
        },
      });
      await prisma.journalEntry.create({
        data: {
          type: "DCA_CYCLE_CLOSED",
          data: {
            strategyId: this.config.id,
            positionId: position.id,
            reason,
            pnl,
            grossPnl,
            entryFeesUsdt: entryFees,
            exitFeeUsdt: closeFill.feeUsdt,
            avgFillPrice: closeFill.fillPrice,
            filledQty: closeFill.filledQty,
            exchangeOrderId: result.exchangeOrderId,
          },
        },
      });
      this.dependencies?.unregisterOpen(this.config);
      this.positionId = undefined;
      this.lastOrderPrice = undefined;
      this.safetyOrders = 0;
      return true;
    } catch (error) {
      await prisma.dCAPosition.update({ where: { id: position.id }, data: { status: "ACTIVE" } });
      throw error;
    }
  }

  private async entryFeesForPosition(positionId: string, cycleStartedAt: Date | null): Promise<number> {
    const rows = await prisma.journalEntry.findMany({
      where: {
        type: "DCA_ORDER_PLACED",
        ...(cycleStartedAt ? { createdAt: { gte: cycleStartedAt } } : {}),
      },
      select: { data: true },
      take: 100,
    });
    return rows.reduce((sum, row) => {
      const data = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
      if (data.positionId !== positionId) return sum;
      const fee = typeof data.feeUsdt === "number" && Number.isFinite(data.feeUsdt) ? data.feeUsdt : 0;
      return sum + fee;
    }, 0);
  }
}

function dcaFillFromOrderResult(result: OrderResult, fallbackPrice: number, fallbackSizeUsdt: number): DcaFill {
  const fillPrice = result.avgFillPrice && Number.isFinite(result.avgFillPrice) && result.avgFillPrice > 0
    ? result.avgFillPrice
    : fallbackPrice;
  const filledQty = result.filledQty && Number.isFinite(result.filledQty) && result.filledQty > 0
    ? result.filledQty
    : fallbackSizeUsdt / Math.max(fillPrice, Number.EPSILON);
  return {
    exchangeOrderId: result.exchangeOrderId,
    fillPrice,
    filledQty,
    feeUsdt: Number.isFinite(result.feeUsdt) ? result.feeUsdt : 0,
    investedUsdt: fillPrice * filledQty,
  };
}
