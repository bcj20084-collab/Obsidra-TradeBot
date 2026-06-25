import { prisma } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";

export class PortfolioRiskEngine {
  constructor(private readonly config: {
    totalMax: number; perSymbolMax: number; bybitMax: number; binanceMax: number;
    dailyLossLimit: number; maxPositions: number;
  }) {}
  async approve(exchange: ExchangeId, symbol: string, requested: number, existingStrategyId?: string) {
    const [open, grids, dca] = await Promise.all([
      prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } }),
      prisma.gridLevel.findMany({ where: { status: "ACTIVE" } }),
      prisma.dCAPosition.findMany({ where: { status: { in: ["ACTIVE", "WAITING"] }, totalInvestedUsdt: { gt: 0 } } }),
    ]);
    const reject = (reason: string) => ({ approved: false, reason });
    const strategyPositionCount = new Set([
      ...grids.map((level) => `grid:${level.strategyId}`),
      ...dca.map((position) => `dca:${position.strategyId}`),
    ]).size;
    const addsToExisting = existingStrategyId
      ? grids.some((level) => level.strategyId === existingStrategyId)
        || dca.some((position) => position.strategyId === existingStrategyId)
      : false;
    if (!addsToExisting && open.length + strategyPositionCount >= this.config.maxPositions) return reject("Maximum portfolio positions reached");
    const gridExposure = grids.reduce((sum, level) => sum + level.orderSizeUsdt, 0);
    const dcaExposure = dca.reduce((sum, position) => sum + position.totalInvestedUsdt, 0);
    const total = open.reduce((sum, trade) => sum + trade.positionSizeUsdt, 0) + gridExposure + dcaExposure;
    if (total + requested > this.config.totalMax) return reject("Total portfolio exposure exceeded");
    const symbolExposure = open.filter((trade) => trade.symbol === symbol).reduce((sum, trade) => sum + trade.positionSizeUsdt, 0)
      + grids.filter((level) => level.symbol === symbol).reduce((sum, level) => sum + level.orderSizeUsdt, 0)
      + dca.filter((position) => position.symbol === symbol).reduce((sum, position) => sum + position.totalInvestedUsdt, 0);
    if (symbolExposure + requested > this.config.perSymbolMax) return reject("Per-symbol exposure exceeded");
    const exchangeExposure = open.filter((trade) => trade.exchange === exchange).reduce((sum, trade) => sum + trade.positionSizeUsdt, 0)
      + grids.filter((level) => level.exchange === exchange).reduce((sum, level) => sum + level.orderSizeUsdt, 0)
      + dca.filter((position) => position.exchange === exchange).reduce((sum, position) => sum + position.totalInvestedUsdt, 0);
    if (exchangeExposure + requested > (exchange === "bybit" ? this.config.bybitMax : this.config.binanceMax)) return reject("Per-exchange exposure exceeded");
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const daily = await prisma.trade.aggregate({ where: { closedAt: { gte: day } }, _sum: { pnlUsdt: true } });
    if ((daily._sum.pnlUsdt ?? 0) <= -this.config.dailyLossLimit) return reject("Total daily loss limit reached");
    return { approved: true };
  }
}
