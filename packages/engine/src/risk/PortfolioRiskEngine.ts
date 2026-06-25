import { prisma } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";

export class PortfolioRiskEngine {
  constructor(private readonly config: {
    totalMax: number; perSymbolMax: number; bybitMax: number; binanceMax: number;
    dailyLossLimit: number; maxPositions: number;
  }) {}
  async approve(exchange: ExchangeId, symbol: string, requested: number) {
    const open = await prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } });
    const reject = (reason: string) => ({ approved: false, reason });
    if (open.length >= this.config.maxPositions) return reject("Maximum portfolio positions reached");
    const total = open.reduce((sum, t) => sum + t.positionSizeUsdt, 0);
    if (total + requested > this.config.totalMax) return reject("Total portfolio exposure exceeded");
    const symbolExposure = open.filter((t) => t.symbol === symbol).reduce((sum, t) => sum + t.positionSizeUsdt, 0);
    if (symbolExposure + requested > this.config.perSymbolMax) return reject("Per-symbol exposure exceeded");
    const exchangeExposure = open.filter((t) => t.exchange === exchange).reduce((sum, t) => sum + t.positionSizeUsdt, 0);
    if (exchangeExposure + requested > (exchange === "bybit" ? this.config.bybitMax : this.config.binanceMax)) return reject("Per-exchange exposure exceeded");
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const daily = await prisma.trade.aggregate({ where: { closedAt: { gte: day } }, _sum: { pnlUsdt: true } });
    if ((daily._sum.pnlUsdt ?? 0) <= -this.config.dailyLossLimit) return reject("Total daily loss limit reached");
    return { approved: true };
  }
}
