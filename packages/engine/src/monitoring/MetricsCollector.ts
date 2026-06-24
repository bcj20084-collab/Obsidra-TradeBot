import { prisma, type AdaptiveConfig, type LiveMetrics, type MarketRegime } from "@obsidra/shared";

export class MetricsCollector {
  private cached?: LiveMetrics;
  private readonly startedAt = Date.now();

  async collect(status: LiveMetrics["botStatus"], regime: MarketRegime, adaptiveConfig: AdaptiveConfig): Promise<LiveMetrics> {
    const trades = await prisma.trade.findMany({ where: { status: "CLOSED" }, orderBy: { closedAt: "asc" } });
    const pnl = trades.map((trade) => trade.pnlUsdt ?? 0);
    const wins = pnl.filter((value) => value > 0);
    const losses = pnl.filter((value) => value < 0);
    const mean = pnl.length ? pnl.reduce((sum, value) => sum + value, 0) / pnl.length : 0;
    const std = Math.sqrt(pnl.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, pnl.length));
    const downside = losses.length ? Math.sqrt(losses.reduce((sum, value) => sum + value ** 2, 0) / losses.length) : 0;
    let equity = 10_000;
    let peak = equity;
    let maxDrawdown = 0;
    for (const value of pnl) {
      equity += value;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    }
    const since = new Date(Date.now() - 86_400_000);
    const generated = await prisma.journalEntry.count({ where: { type: "SIGNAL_GENERATED", createdAt: { gte: since } } });
    const rejected = await prisma.journalEntry.count({ where: { type: "RISK_REJECTED", createdAt: { gte: since } } });
    const daily = await prisma.dailyMetrics.findMany({ orderBy: { date: "asc" }, take: 30 });
    const openTrades = await prisma.trade.findMany({ where: { status: { in: ["OPEN", "FILLED", "CLOSING"] } } });
    const symbolNames = [...new Set(trades.map((trade) => trade.symbol))];
    this.cached = {
      totalPnlUsdt: pnl.reduce((sum, value) => sum + value, 0),
      totalPnlPct: ((equity - 10_000) / 10_000) * 100,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      profitFactor: losses.length ? wins.reduce((s, v) => s + v, 0) / Math.abs(losses.reduce((s, v) => s + v, 0)) : 0,
      sharpeRatio: std ? mean / std : 0,
      sortinoRatio: downside ? mean / downside : 0,
      maxDrawdown,
      currentDrawdown: ((peak - equity) / peak) * 100,
      totalTrades: trades.length,
      tradesLast24h: trades.filter((trade) => trade.closedAt && trade.closedAt >= since).length,
      avgHoldTimeMinutes: average(trades.map((trade) => (trade.holdTimeSeconds ?? 0) / 60)),
      avgWinUsdt: average(wins),
      avgLossUsdt: average(losses),
      avgSlippage: average(trades.map((trade) => (trade.slippage ?? 0) * 100)),
      totalFeesPaidUsdt: trades.reduce((sum, trade) => sum + (trade.feeUsdt ?? 0), 0),
      signalsGenerated24h: generated,
      signalsRejected24h: rejected,
      uptime: Math.floor((Date.now() - this.startedAt) / 1_000),
      lastTradeAt: trades.at(-1)?.closedAt?.toISOString() ?? null,
      botStatus: status,
      marketRegime: regime,
      adaptiveConfig,
      equityCurve: daily.map((item) => ({ date: item.date, equity: item.equityEnd })),
      symbols: Object.fromEntries(symbolNames.map((symbol) => {
        const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
        const symbolWins = symbolTrades.filter((trade) => (trade.pnlUsdt ?? 0) > 0);
        return [symbol, {
          pnl: symbolTrades.reduce((sum, trade) => sum + (trade.pnlUsdt ?? 0), 0),
          trades: symbolTrades.length,
          winRate: symbolTrades.length ? (symbolWins.length / symbolTrades.length) * 100 : 0,
          openPosition: openTrades.some((trade) => trade.symbol === symbol),
        }];
      })),
      totalExposureUsdt: openTrades.reduce((sum, trade) => sum + trade.positionSizeUsdt, 0),
      openPositionsCount: openTrades.length,
      mlAccuracy: (await prisma.mlWeights.findFirst({ orderBy: { trainedAt: "desc" } }))?.cvAccuracy ?? null,
    };
    return this.cached;
  }

  get latest(): LiveMetrics | undefined {
    return this.cached;
  }
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
