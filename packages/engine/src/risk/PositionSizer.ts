export interface TradeStats { count: number; winRate: number; avgWin: number; avgLoss: number; equity: number; }

export class PositionSizer {
  size(stats: TradeStats, maxPositionUsdt: number) {
    if (stats.count < 5) return Math.min(stats.equity * 0.01, maxPositionUsdt);
    const safeLoss = Math.max(stats.avgLoss, 0.0001);
    const kelly = (stats.winRate * stats.avgWin - (1 - stats.winRate) * safeLoss) / Math.max(stats.avgWin, 0.0001);
    const quarterKelly = Math.max(0.005, kelly * 0.25);
    return Math.min(quarterKelly * stats.equity, maxPositionUsdt);
  }
}
