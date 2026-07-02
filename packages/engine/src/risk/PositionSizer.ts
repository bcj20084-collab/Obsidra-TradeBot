interface TradeStat {
  pnlUsdt: number | null;
}

const BOOTSTRAP_TRADE_COUNT = 5;
const FULL_KELLY_TRADE_COUNT = 30;

export function calculatePositionSize(
  equity: number,
  trades: TradeStat[],
  maxPositionUsdt: number,
  maxPositionPct: number,
): number {
  const bootstrapSize = Math.min(equity * 0.01, maxPositionUsdt);
  if (trades.length < BOOTSTRAP_TRADE_COUNT) return bootstrapSize;
  const wins = trades.filter((trade) => (trade.pnlUsdt ?? 0) > 0).map((trade) => trade.pnlUsdt!);
  const losses = trades.filter((trade) => (trade.pnlUsdt ?? 0) < 0).map((trade) => Math.abs(trade.pnlUsdt!));
  if (!wins.length || !losses.length) return bootstrapSize;
  const winRate = wins.length / trades.length;
  const avgWin = wins.reduce((sum, value) => sum + value, 0) / wins.length;
  const avgLoss = losses.reduce((sum, value) => sum + value, 0) / losses.length;
  const kelly = Math.max(0, (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin) * 0.25;
  const adaptiveCap = equity * (maxPositionPct / 100);
  const kellySize = Math.max(0, Math.min(kelly * equity, adaptiveCap, maxPositionUsdt));
  const sampleWeight = Math.min(1, Math.max(0, (trades.length - BOOTSTRAP_TRADE_COUNT) / (FULL_KELLY_TRADE_COUNT - BOOTSTRAP_TRADE_COUNT)));
  const blendedSize = bootstrapSize * (1 - sampleWeight) + kellySize * sampleWeight;
  return Math.max(0, Math.min(blendedSize, adaptiveCap, maxPositionUsdt));
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
