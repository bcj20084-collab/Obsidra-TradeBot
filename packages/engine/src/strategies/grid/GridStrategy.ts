import { randomUUID } from "node:crypto";
import { moduleLogger, prisma } from "@obsidra/shared";
import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import type { ExchangeRouter } from "../../exchanges/ExchangeRouter.js";
import { BaseStrategy } from "../BaseStrategy.js";
import type { StrategyDependencies } from "../StrategyFactory.js";
import { calculateGridLevels } from "./GridLevelManager.js";

const log = moduleLogger("GridStrategy");

export class GridStrategy extends BaseStrategy {
  constructor(
    config: ConstructorParameters<typeof BaseStrategy>[0],
    private readonly exchanges: ExchangeRouter,
    private readonly dependencies?: StrategyDependencies,
  ) {
    super(config);
  }

  async onCandle(candle: OHLCVCandle): Promise<void> {
    if (!["RUNNING", "PAPER"].includes(this.metrics.status)) return;
    const existing = await prisma.gridLevel.count({ where: { strategyId: this.config.id, status: { in: ["PENDING", "ACTIVE"] } } });
    if (existing) return;
    const p = this.config.params;
    const totalInvestUsdt = Number(p.totalInvestUsdt);
    const approval = await this.dependencies?.approveOrder(this.config, "LONG", totalInvestUsdt);
    if (approval && !approval.approved) {
      log.warn({ strategyId: this.config.id, reason: approval.reason }, "grid activation rejected");
      return;
    }
    const levels = calculateGridLevels(Number(p.lowerPrice), Number(p.upperPrice), Number(p.gridCount), totalInvestUsdt, candle.close);
    await prisma.gridLevel.createMany({ data: levels.map((level) => ({ strategyId: this.config.id, symbol: this.config.symbol, exchange: this.config.exchange, levelPrice: level.price, orderSizeUsdt: level.orderSizeUsdt, status: "PENDING" })) });
    const pending = await prisma.gridLevel.findMany({ where: { strategyId: this.config.id, status: "PENDING" }, orderBy: { levelPrice: "asc" } });
    const placed: Array<{ id: string; orderId: string }> = [];
    for (const level of pending) {
      try {
        const result = await this.exchanges.placeOrder(this.config.exchange, {
          symbol: level.symbol,
          side: level.levelPrice < candle.close ? "Buy" : "Sell",
          orderType: "Limit",
          qty: Number((level.orderSizeUsdt / level.levelPrice).toFixed(6)),
          price: level.levelPrice,
          clientOrderId: `grid-${randomUUID()}`.slice(0, 36),
        });
        placed.push({ id: level.id, orderId: result.exchangeOrderId });
        await prisma.gridLevel.update({
          where: { id: level.id },
          data: { status: "ACTIVE", exchangeOrderId: result.exchangeOrderId },
        });
      } catch (error) {
        await Promise.allSettled(placed.map((order) => this.exchanges.get(this.config.exchange).cancelOrder(this.config.symbol, order.orderId)));
        await prisma.gridLevel.updateMany({
          where: { strategyId: this.config.id, status: { in: ["PENDING", "ACTIVE"] } },
          data: { status: "CANCELLED" },
        });
        this.pause();
        log.error({ error, strategyId: this.config.id, placed: placed.length }, "grid placement rolled back");
        throw error;
      }
    }
    this.dependencies?.registerOpen(this.config, "LONG", totalInvestUsdt);
  }
}
