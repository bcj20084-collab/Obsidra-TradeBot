import type { Metrics, Trade } from "../lib/types";
import { EquityCurve } from "../components/EquityCurve";
import { MetricsCards } from "../components/MetricsCards";
import { TradeTable } from "../components/TradeTable";

export function Overview({ metrics, trades }: { metrics: Metrics; trades: Trade[] }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="label">Portfolio intelligence</div>
          <h1 className="mt-2 text-3xl font-bold">Good evening, operator.</h1>
          <p className="mt-2 text-slate-400">Risk-gated execution and adaptive market context in one quiet surface.</p>
        </div>
        <div className="card flex gap-8">
          <div><div className="label">Equity</div><div className="mt-2 text-2xl font-bold">${(10_000 + metrics.totalPnlUsdt).toLocaleString()}</div></div>
          <div><div className="label">PnL</div><div className={`mt-2 text-2xl font-bold ${metrics.totalPnlUsdt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{metrics.totalPnlUsdt.toFixed(2)}</div></div>
        </div>
      </div>
      <MetricsCards metrics={metrics} />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="card"><div className="label mb-4">30 day equity curve</div><EquityCurve data={metrics.equityCurve} /></div>
        <div className="card">
          <div className="label">Live market</div>
          <div className="mt-5 text-4xl font-bold">BTC/USDT</div>
          <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-slate-500">Regime</div><div className="mt-1 text-cyan">{metrics.marketRegime}</div></div>
            <div><div className="text-slate-500">Status</div><div className="mt-1">{metrics.botStatus}</div></div>
            <div><div className="text-slate-500">Trades</div><div className="mt-1">{metrics.totalTrades}</div></div>
            <div><div className="text-slate-500">Drawdown</div><div className="mt-1">{metrics.currentDrawdown.toFixed(2)}%</div></div>
          </div>
        </div>
      </div>
      <div className="card"><div className="label mb-3">Latest executions</div><TradeTable trades={trades.slice(0, 5)} /></div>
    </div>
  );
}
