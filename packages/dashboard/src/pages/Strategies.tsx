import { useEffect, useState } from "react";
import { Activity, BrainCircuit, Cpu, ShieldCheck, Sparkles, TrendingUp, Workflow } from "lucide-react";
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

  const online = items.filter((item) => item.status !== "DISABLED").length;
  const exposure = items.reduce((sum, item) => sum + item.openExposureUsdt, 0);
  const pnl = items.reduce((sum, item) => sum + item.pnlUsdt, 0);

  return (
    <div className="space-y-6">
      <section className="strategy-os-hero glass-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="hero-eyebrow">
              <Workflow size={14} />
              Isolated execution envelopes
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white">Strategy OS</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Fiecare strategie are propria zonă de risc, PnL, expunere și status. Aici vezi ce module merită păstrate, urmărite sau oprite.
            </p>
          </div>
          <div className="optimizer-score-card">
            <div className="label">Modules online</div>
            <div className="mt-2 text-4xl font-black text-white">{online}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <StrategyOsTile icon={BrainCircuit} label="Brain layer" value="signals + filters" />
          <StrategyOsTile icon={ShieldCheck} label="Risk layer" value={`${exposure.toFixed(2)} USDT exposure`} />
          <StrategyOsTile icon={Cpu} label="PnL layer" value={`${formatSigned(pnl)} USDT`} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const winRate = item.tradeCount ? (item.winCount / item.tradeCount) * 100 : 0;
          const healthy = item.tradeCount < 5 ? "LEARNING" : winRate >= 50 ? "HEALTHY" : "WATCH";
          return (
            <div className="strategy-module-card glass-card transition hover:-translate-y-0.5 hover:border-cyan/20" key={item.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="label">{item.exchange} · {item.symbol}</div>
                  <h2 className="mt-2 text-2xl font-black">{item.type}</h2>
                </div>
                <span className={`pill ${item.status === "LIVE" || item.status === "PAPER" ? "pill-success" : "pill-danger"}`}>
                  ● {item.status}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="pill">{healthy}</span>
                <span className="pill">{item.openPositions} open</span>
                <span className="pill">{item.tradeCount} trades</span>
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

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-slate-400">
                {item.tradeCount < 5
                  ? "Learning sample: strângem date înainte să tragem concluzii."
                  : winRate >= 50
                    ? "Module looks healthy in current sample."
                    : "Watchlist: are nevoie de filtru sau cooldown mai strict."}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StrategyOsTile({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
      <div className="metric-icon tone-cyan"><Icon size={16} /></div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 truncate text-lg font-black text-white">{value}</div>
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

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
