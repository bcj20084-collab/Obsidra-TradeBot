import { prisma, type Direction } from "@obsidra/shared";

export class PortfolioManager {
  constructor(
    private readonly maxOpenPositions: number,
    private readonly maxExposureUsdt: number,
  ) {}

  async approve(symbol: string, direction: Direction, requestedUsdt: number): Promise<{ approved: boolean; reason?: string }> {
    const open = await prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } });
    if (open.length >= this.maxOpenPositions) return { approved: false, reason: "Portfolio position limit reached" };
    const exposure = open.reduce((sum, trade) => sum + trade.positionSizeUsdt, 0);
    if (exposure + requestedUsdt > this.maxExposureUsdt) return { approved: false, reason: "Portfolio exposure limit reached" };
    const correlated = open.some((trade) => trade.symbol !== symbol && trade.direction === direction);
    if (correlated && exposure + requestedUsdt > this.maxExposureUsdt * 0.6) return { approved: false, reason: "Correlated exposure limit reached" };
    return { approved: true };
  }
}
