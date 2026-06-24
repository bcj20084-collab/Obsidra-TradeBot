interface TradeStat {
  pnlUsdt: number | null;
}

export function calculatePositionSize(
  equity: number,
  trades: TradeStat[],
  maxPositionUsdt: number,
  maxPositionPct: number,
): number {
  if (trades.length < 5) return Math.min(equity * 0.01, maxPositionUsdt);
  const wins = trades.filter((trade) => (trade.pnlUsdt ?? 0) > 0).map((trade) => trade.pnlUsdt!);
  const losses = trades.filter((trade) => (trade.pnlUsdt ?? 0) < 0).map((trade) => Math.abs(trade.pnlUsdt!));
  if (!wins.length || !losses.length) return Math.min(equity * 0.01, maxPositionUsdt);
  const winRate = wins.length / trades.length;
  const avgWin = wins.reduce((sum, value) => sum + value, 0) / wins.length;
  const avgLoss = losses.reduce((sum, value) => sum + value, 0) / losses.length;
  const kelly = Math.max(0, (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin) * 0.25;
  const adaptiveCap = equity * (maxPositionPct / 100);
  return Math.max(0, Math.min(kelly * equity, adaptiveCap, maxPositionUsdt));
}
