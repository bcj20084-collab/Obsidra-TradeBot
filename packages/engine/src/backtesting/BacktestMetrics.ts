export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  fees: number;
  reason: "SL" | "TP" | "END";
}

export function calculateBacktestMetrics(initialEquity: number, trades: BacktestTrade[]) {
  const returns = trades.map((trade) => trade.pnl);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  let equity = initialEquity;
  let peak = equity;
  let maxDrawdown = 0;
  const curve = trades.map((trade) => {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    const drawdown = peak ? ((peak - equity) / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    return { date: new Date(trade.exitTime).toISOString().slice(0, 10), equity, drawdown };
  });
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const deviation = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length));
  const downside = Math.sqrt(losses.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, losses.length));
  return {
    totalTrades: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)) : 0,
    sharpeRatio: deviation ? (mean / deviation) * Math.sqrt(365) : 0,
    sortinoRatio: downside ? (mean / downside) * Math.sqrt(365) : 0,
    calmarRatio: maxDrawdown ? (((equity - initialEquity) / initialEquity) * 100) / maxDrawdown : 0,
    maxDrawdown,
    totalPnlUsdt: equity - initialEquity,
    totalPnlPct: ((equity - initialEquity) / initialEquity) * 100,
    totalFees: trades.reduce((sum, trade) => sum + trade.fees, 0),
    avgWinUsdt: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0,
    avgLossUsdt: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
    equityCurve: curve,
    trades,
  };
}
