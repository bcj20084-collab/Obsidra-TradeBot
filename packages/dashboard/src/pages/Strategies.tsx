import { useEffect, useState } from "react";
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

const statusColor = {
  DISABLED: "text-slate-500",
  PAPER: "text-amber-400",
  LIVE: "text-emerald-400",
};

export function Strategies() {
  const [items, setItems] = useState<StrategyItem[]>([]);
  useEffect(() => {
    const load = () => void (trpc.query("strategies.list") as Promise<StrategyItem[]>).then(setItems);
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="space-y-5">
      <div>
        <div className="label">Isolated execution envelopes</div>
        <h1 className="mt-2 text-3xl font-bold">Strategies</h1>
        <p className="mt-2 text-sm text-slate-400">Activation and paper-to-live changes require environment configuration and redeployment.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div className="card" key={item.id}>
            <div className="flex items-start justify-between gap-4">
              <div><div className="label">{item.exchange} · {item.symbol}</div><h2 className="mt-2 text-xl font-bold">{item.type}</h2></div>
              <span className={`text-sm font-semibold ${statusColor[item.status]}`}>● {item.status}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <Metric label="Net PnL" value={`${item.pnlUsdt.toFixed(2)} USDT`} />
              <Metric label="Trades" value={String(item.tradeCount)} />
              <Metric label="Open exposure" value={`${item.openExposureUsdt.toFixed(2)} USDT`} />
              <Metric label="Risk envelope" value={`${item.maxPositionUsdt.toFixed(0)} USDT`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="label">{label}</div><div className="mt-1 font-mono">{value}</div></div>;
}
