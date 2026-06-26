import { useEffect, useState } from "react";
import { Activity, ShieldCheck, TrendingUp } from "lucide-react";
import { trpc } from "../lib/api";

interface StrategyItem {
  id: string;
  type: string;
  exchange: string;
  symbol: string;
  status: "DISABLED" | "PAPER" | "LIVE";
  maxPositionUsdt: number;
  pnlUsdt: number;
  feesUsdt: number;
  tradeCount: number;
  winCount: number;
  openPositions: number;
  openExposureUsdt: number;
}

export function Strategies() {
  const [items, setItems] = useState<StrategyItem[]>([]);

  useEffect(() => {
    const load = () => void (trpc.query("strategies.list") as Promise<StrategyItem[]>).then(setItems);
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Isolated execution envelopes</div>
        <h1 className="mt-2 text-4xl font-black">Strategies</h1>
        <p className="mt-2 text-sm text-slate-400">Paper, risk, exposure, and PnL state per strategy module.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const winRate = item.tradeCount ? (item.winCount / item.tradeCount) * 100 : 0;
          return (
            <div className="glass-card transition hover:-translate-y-0.5 hover:border-cyan/20" key={item.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="label">{item.exchange} · {item.symbol}</div>
                  <h2 className="mt-2 text-2xl font-black">{item.type}</h2>
                </div>
                <span className={`pill ${item.status === "LIVE" ? "pill-success" : item.status === "DISABLED" ? "pill-danger" : ""}`}>
                  ● {item.status}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <Metric label="Net PnL" value={`${item.pnlUsdt.toFixed(2)} USDT`} icon={TrendingUp} />
                <Metric label="Win rate" value={`${winRate.toFixed(1)}%`} icon={Activity} />
                <Metric label="Open exposure" value={`${item.openExposureUsdt.toFixed(2)} USDT`} icon={ShieldCheck} />
                <Metric label="Risk envelope" value={`${item.maxPositionUsdt.toFixed(0)} USDT`} icon={ShieldCheck} />
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, Math.max(4, winRate))}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-slate-500"><Icon size={14} /><span className="label">{label}</span></div>
      <div className="mt-2 font-mono font-bold text-white">{value}</div>
    </div>
  );
}
