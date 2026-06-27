import { BrainCircuit, RadioTower, ShieldCheck, Sparkles, TrendingUp, Zap } from "lucide-react";
import type { Metrics, SignalFeedItem, Trade } from "../lib/types";

export function PremiumIntelligence({ metrics, trades, signals }: { metrics: Metrics; trades: Trade[]; signals: SignalFeedItem[] }) {
  const latestSignal = signals[0];
  const latestTrade = trades[0];
  const closedTrades = trades.filter((trade) => trade.status === "CLOSED");
  const wins = closedTrades.filter((trade) => (trade.pnlUsdt ?? 0) > 0).length;
  const readiness = Math.round(Math.min(100, Math.max(12,
    (metrics.botStatus === "RUNNING" ? 30 : 5) +
    Math.min(25, (metrics.signalsGenerated24h ?? 0) / 4) +
    Math.min(20, metrics.winRate / 4) +
    Math.max(0, 25 - metrics.currentDrawdown * 3),
  )));
  const pulse = metrics.botStatus === "RUNNING" ? "Live AI loop" : "Standing by";

  return (
    <section className="premium-command-grid">
      <div className="premium-oracle glass-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="label">Obsidra intelligence layer</div>
            <h3 className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-white md:text-4xl">
              Smart autopilot watching market structure, risk and paper execution.
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              The dashboard now reads like a trading mission-control room: signal quality, safety posture, live loop health and latest execution context in one glance.
            </p>
          </div>
          <div className="live-orb">
            <span />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{pulse}</div>
              <div className="mt-1 text-2xl font-black text-white">{readiness}%</div>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          <IntelTile icon={BrainCircuit} label="Brain score" value={`${readiness}/100`} detail={latestSignal ? `${latestSignal.symbol} ${latestSignal.type.replaceAll("_", " ")}` : "Waiting for next scan"} accent="cyan" />
          <IntelTile icon={ShieldCheck} label="Safety state" value={metrics.safetySupervisor?.level ?? "WARMING"} detail={metrics.safetySupervisor?.summary ?? "Supervisor will report after the next cycle"} accent="emerald" />
          <IntelTile icon={TrendingUp} label="Closed trades" value={`${closedTrades.length}`} detail={`${wins} wins | ${Math.max(0, closedTrades.length - wins)} losses`} accent="violet" />
        </div>
      </div>

      <div className="glass-card premium-side-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="label">Execution radar</div>
            <h3 className="mt-2 text-2xl font-black">Live tape</h3>
          </div>
          <RadioTower className="text-cyan" size={26} />
        </div>

        <div className="mt-5 space-y-4">
          <RadarLine label="Signals 24h" value={String(metrics.signalsGenerated24h ?? 0)} percent={Math.min(100, (metrics.signalsGenerated24h ?? 0) / 2)} />
          <RadarLine label="Rejected" value={String(metrics.signalsRejected24h ?? 0)} percent={Math.min(100, (metrics.signalsRejected24h ?? 0) / 2)} warn />
          <RadarLine label="Exposure" value={`${(metrics.totalExposureUsdt ?? 0).toFixed(2)} USDT`} percent={Math.min(100, (metrics.totalExposureUsdt ?? 0) / 10)} />
        </div>

        <div className="premium-latest mt-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
            <Zap size={15} className="text-amber-300" />
            Latest move
          </div>
          {latestTrade ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xl font-black text-white">{latestTrade.symbol}</div>
                <span className={`direction-badge ${latestTrade.direction === "LONG" ? "direction-long" : "direction-short"}`}>{latestTrade.direction}</span>
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {latestTrade.status} | PnL {(latestTrade.pnlUsdt ?? 0).toFixed(3)} USDT
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Waiting for first execution.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function IntelTile({ icon: Icon, label, value, detail, accent }: { icon: typeof Sparkles; label: string; value: string; detail: string; accent: "cyan" | "emerald" | "violet" }) {
  return (
    <div className={`intel-tile intel-${accent}`}>
      <div className="flex items-center gap-3">
        <div className={`metric-icon tone-${accent}`}><Icon size={18} /></div>
        <div>
          <div className="label">{label}</div>
          <div className="mt-1 text-2xl font-black text-white">{value}</div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}

function RadarLine({ label, value, percent, warn = false }: { label: string; value: string; percent: number; warn?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-bold text-white">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${warn ? "bg-amber-300" : "bg-cyan"}`} style={{ width: `${Math.max(5, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}
