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

export function capPositionByStopRisk(
  positionSizeUsdt: number,
  equity: number,
  entryPrice: number,
  stopLossPrice: number,
  leverage: number,
  maxRiskPct: number,
): number {
  if (positionSizeUsdt <= 0 || equity <= 0 || entryPrice <= 0 || leverage <= 0 || maxRiskPct <= 0) return 0;
  const stopDistancePct = Math.abs(entryPrice - stopLossPrice) / entryPrice;
  if (!Number.isFinite(stopDistancePct) || stopDistancePct <= 0) return 0;
  const riskBudgetUsdt = equity * (maxRiskPct / 100);
  const maximumMarginAtRisk = riskBudgetUsdt / (stopDistancePct * leverage);
  return Math.max(0, Math.min(positionSizeUsdt, maximumMarginAtRisk));
}
