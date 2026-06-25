import { randomUUID } from "node:crypto";
import { moduleLogger, prisma } from "@obsidra/shared";
import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import type { ExchangeRouter } from "../../exchanges/ExchangeRouter.js";
import { BaseStrategy } from "../BaseStrategy.js";
import type { StrategyDependencies } from "../StrategyFactory.js";

const log = moduleLogger("DCAStrategy");

export class DCAStrategy extends BaseStrategy {
  private positionId: string | undefined;
  private lastOrderPrice: number | undefined;
  private safetyOrders = 0;

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
    if (!["RUNNING", "PAPER"].includes(this.metrics.status)) return;
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
      const quantity = baseOrderUsdt / candle.close;
      const targetProfitPct = Number(params.targetProfitPct ?? 1.5) / 100;
      const stopLossPct = Number(params.stopLossPct ?? 10) / 100;
      await prisma.dCAPosition.update({
        where: { id: this.positionId },
        data: {
          status: "ACTIVE",
          averageEntryPrice: candle.close,
          totalQty: quantity,
          totalInvestedUsdt: baseOrderUsdt,
          targetPrice: direction === "LONG" ? candle.close * (1 + targetProfitPct) : candle.close * (1 - targetProfitPct),
          stopLossPrice: direction === "LONG" ? candle.close * (1 - stopLossPct) : candle.close * (1 + stopLossPct),
          cycleStartedAt: new Date(),
        },
      });
      try {
        await this.placeOrder(candle.close, baseOrderUsdt, direction, "base");
      } catch (error) {
        await prisma.dCAPosition.update({
          where: { id: this.positionId },
          data: { status: "WAITING", averageEntryPrice: null, totalQty: 0, totalInvestedUsdt: 0, cycleStartedAt: null },
        });
        this.pause();
        throw error;
      }
      this.dependencies?.registerOpen(this.config, direction as "LONG" | "SHORT", baseOrderUsdt);
      this.lastOrderPrice = candle.close;
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
    const addedQty = safetyOrderUsdt / candle.close;
    const totalQty = current.totalQty + addedQty;
    const totalInvestedUsdt = current.totalInvestedUsdt + safetyOrderUsdt;
    const averageEntryPrice = totalQty > 0 ? totalInvestedUsdt / totalQty : candle.close;
    const targetProfitPct = Number(params.targetProfitPct ?? 1.5) / 100;
    const stopLossPct = Number(params.stopLossPct ?? 10) / 100;
    await prisma.$transaction([
      prisma.dCAPosition.update({
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
      }),
      prisma.journalEntry.create({
        data: {
          type: "DCA_SAFETY_ORDER_INTENT",
          data: { strategyId: this.config.id, price: candle.close, sizeUsdt: safetyOrderUsdt, nextSafetyOrder: this.safetyOrders + 1 },
        },
      }),
    ]);
    try {
      await this.placeOrder(candle.close, safetyOrderUsdt, direction, `safety-${this.safetyOrders + 1}`);
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
    this.safetyOrders += 1;
    this.dependencies?.registerOpen(this.config, direction as "LONG" | "SHORT", safetyOrderUsdt);
    this.lastOrderPrice = candle.close;
  }

  private async placeOrder(price: number, sizeUsdt: number, direction: string, suffix: string): Promise<void> {
    const result = await this.exchanges.placeOrder(this.config.exchange, {
      symbol: this.config.symbol,
      side: direction === "SHORT" ? "Sell" : "Buy",
      orderType: "Market",
      qty: Number((sizeUsdt / price).toFixed(6)),
      clientOrderId: `dca-${suffix}-${randomUUID()}`.slice(0, 36),
    });
    await prisma.journalEntry.create({
      data: { type: "DCA_ORDER_PLACED", data: { strategyId: this.config.id, exchangeOrderId: result.exchangeOrderId, price, sizeUsdt } },
    });
  }

  private async tryCloseCycle(
    price: number,
    position: { id: string; totalQty: number; averageEntryPrice: number | null; targetPrice: number | null; stopLossPrice: number | null },
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
      const entry = position.averageEntryPrice ?? price;
      const pnl = direction === "LONG" ? (price - entry) * position.totalQty : (entry - price) * position.totalQty;
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
        data: { type: "DCA_CYCLE_CLOSED", data: { strategyId: this.config.id, reason, pnl, exchangeOrderId: result.exchangeOrderId } },
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
}
