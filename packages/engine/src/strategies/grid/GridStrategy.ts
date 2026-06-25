import { prisma } from "@obsidra/shared";
import type { OHLCVCandle } from "../../exchanges/IExchangeAdapter.js";
import { BaseStrategy } from "../BaseStrategy.js";
import { calculateGridLevels } from "./GridLevelManager.js";

export class GridStrategy extends BaseStrategy {
  async onCandle(candle: OHLCVCandle): Promise<void> {
    if (!["RUNNING", "PAPER"].includes(this.metrics.status) || await prisma.gridLevel.count({ where: { strategyId: this.config.id } })) return;
    const p = this.config.params;
    const levels = calculateGridLevels(Number(p.lowerPrice), Number(p.upperPrice), Number(p.gridCount), Number(p.totalInvestUsdt), candle.close);
    await prisma.gridLevel.createMany({ data: levels.map((level) => ({ strategyId: this.config.id, symbol: this.config.symbol, exchange: this.config.exchange, levelPrice: level.price, orderSizeUsdt: level.orderSizeUsdt, status: "PENDING" })) });
  }
}
