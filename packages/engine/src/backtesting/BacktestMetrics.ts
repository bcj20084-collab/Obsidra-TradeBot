export interface BacktestTrade {
  symbol?: string;
  entryTime: number;
  exitTime: number;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  pnlPct?: number;
  fees: number;
  reason: "SL" | "TP" | "END";
  holdTimeMinutes?: number;
  riskRewardRatio?: number;
}

export interface BacktestResult {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  avgDrawdown: number;
  totalPnlUsdt: number;
  totalPnlPct: number;
  annualizedReturn: number;
  totalFees: number;
  netPnlAfterFees: number;
  avgWinUsdt: number;
  avgLossUsdt: number;
  avgRR: number;
  avgHoldTimeMinutes: number;
  maxConsecLosses: number;
  maxConsecWins: number;
  monthlyReturns: Array<{ month: string; pnl: number; trades: number }>;
  equityCurve: Array<{ date: string; equity: number; drawdown: number }>;
  trades: BacktestTrade[];
}

export function calculateBacktestMetrics(initialEquity: number, trades: BacktestTrade[]): BacktestResult {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const totalWins = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const totalLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  let equity = initialEquity;
  let peak = equity;
  let maxDrawdown = 0;
  let currentDrawdownDays = 0;
  let maxDrawdownDuration = 0;
  let drawdownSum = 0;
  let drawdownPoints = 0;
  let maxConsecLosses = 0;
  let maxConsecWins = 0;
  let currentLosses = 0;
  let currentWins = 0;
  const monthly = new Map<string, { pnl: number; trades: number }>();

  const equityCurve = trades.map((trade) => {
    equity += trade.pnl;
    if (equity >= peak) {
      peak = equity;
      currentDrawdownDays = 0;
    } else {
      currentDrawdownDays += 1;
      maxDrawdownDuration = Math.max(maxDrawdownDuration, currentDrawdownDays);
    }
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    drawdownSum += drawdown;
    drawdownPoints += 1;

    const month = new Date(trade.exitTime).toISOString().slice(0, 7);
    const current = monthly.get(month) ?? { pnl: 0, trades: 0 };
    current.pnl += trade.pnl;
    current.trades += 1;
    monthly.set(month, current);

    if (trade.pnl > 0) {
      currentWins += 1;
      currentLosses = 0;
    } else if (trade.pnl < 0) {
      currentLosses += 1;
      currentWins = 0;
    }
    maxConsecWins = Math.max(maxConsecWins, currentWins);
    maxConsecLosses = Math.max(maxConsecLosses, currentLosses);

    return { date: new Date(trade.exitTime).toISOString().slice(0, 10), equity, drawdown };
  });

  const returns = trades.map((trade) => trade.pnl / Math.max(initialEquity, Number.EPSILON));
  const meanReturn = mean(returns);
  const stdDev = standardDeviation(returns, meanReturn);
  const downsideReturns = returns.filter((value) => value < 0);
  const downsideDev = Math.sqrt(downsideReturns.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, downsideReturns.length));
  const firstTime = trades[0]?.entryTime;
  const lastTime = trades.at(-1)?.exitTime;
  const days = firstTime && lastTime ? Math.max(1, (lastTime - firstTime) / 86_400_000) : 1;
  const totalPnlUsdt = equity - initialEquity;
  const totalPnlPct = (totalPnlUsdt / Math.max(initialEquity, Number.EPSILON)) * 100;
  const annualizedReturn = ((equity / Math.max(initialEquity, Number.EPSILON)) ** (365 / days) - 1) * 100;
  const avgHoldTimeMinutes = mean(trades.map((trade) => trade.holdTimeMinutes ?? Math.max(0, (trade.exitTime - trade.entryTime) / 60_000)));

  return {
    totalTrades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Number.POSITIVE_INFINITY : 0,
    sharpeRatio: stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(365) : 0,
    sortinoRatio: downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(365) : 0,
    calmarRatio: maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0,
    maxDrawdown,
    maxDrawdownDuration,
    avgDrawdown: drawdownPoints ? drawdownSum / drawdownPoints : 0,
    totalPnlUsdt,
    totalPnlPct,
    annualizedReturn,
    totalFees: trades.reduce((sum, trade) => sum + trade.fees, 0),
    netPnlAfterFees: totalPnlUsdt,
    avgWinUsdt: wins.length ? totalWins / wins.length : 0,
    avgLossUsdt: losses.length ? losses.reduce((sum, trade) => sum + trade.pnl, 0) / losses.length : 0,
    avgRR: mean(trades.map((trade) => trade.riskRewardRatio ?? 0).filter((value) => value > 0)),
    avgHoldTimeMinutes,
    maxConsecLosses,
    maxConsecWins,
    monthlyReturns: [...monthly.entries()].map(([month, value]) => ({ month, pnl: value.pnl, trades: value.trades })),
    equityCurve,
    trades,
  };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[], average = mean(values)): number {
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length) : 0;
}
