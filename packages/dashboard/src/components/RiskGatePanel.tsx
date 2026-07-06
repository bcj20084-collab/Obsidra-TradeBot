import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ShieldAlert, ShieldCheck, TimerReset, Zap } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, RiskGateDiagnosticItem } from "../lib/types";

export function RiskGatePanel() {
  const [health, setHealth] = useState<DeepHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => void fetchDeepHealth()
      .then((next) => {
        if (!alive) return;
        setHealth(next);
        setError("");
      })
      .catch(() => {
        if (alive) setError("Risk gate diagnostics unavailable");
      });
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const risk = health?.riskGateDiagnostics;
  const items = risk?.items ?? [];
  const rejected = useMemo(() => items.reduce((sum, item) => sum + item.rejectCount24h, 0), [items]);

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="hero-eyebrow">
            <ShieldCheck size={14} />
            Risk Gate / Execution permission
          </div>
          <h3 className="mt-3 text-3xl font-black text-white">De ce READY nu devine trade?</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            {error || risk?.summary || "Risk gate verifică drawdown, cooldown, sizing, RR, poziții și expunere înainte de orice entry."}
          </p>
        </div>
        <div className={`rounded-3xl border px-5 py-4 ${rejected ? "border-amber-400/25 bg-amber-400/10" : "border-emerald-400/25 bg-emerald-400/10"}`}>
          <div className="label">Rejects 24h</div>
          <div className={`mt-1 font-mono text-3xl font-black ${rejected ? "text-amber-200" : "text-emerald-300"}`}>{rejected}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {items.length ? items.map((item) => <RiskCard item={item} key={item.strategyId} />) : (
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm text-slate-400 xl:col-span-3">Waiting for risk diagnostics...</div>
        )}
      </div>
    </section>
  );
}

function RiskCard({ item }: { item: RiskGateDiagnosticItem }) {
  const clear = item.level === "CLEAR";
  const cooldown = item.level === "COOLDOWN";
  const Icon = clear ? CheckCircle2 : cooldown ? TimerReset : ShieldAlert;
  return (
    <article className={`rounded-3xl border p-5 ${clear ? "border-emerald-400/20 bg-emerald-400/10" : "border-amber-400/20 bg-amber-400/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] ${clear ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-100"}`}>
            <Icon size={13} />
            {item.level}
          </span>
          <h4 className="mt-4 text-2xl font-black text-white">{item.symbol}</h4>
          <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.exchange} · {item.type}</div>
        </div>
        <div className="metric-icon tone-cyan"><Zap size={17} /></div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Mini label="Rejects" value={String(item.rejectCount24h)} />
        <Mini label="Score" value={item.latestSignalScore === null ? "—" : String(item.latestSignalScore)} />
        <Mini label="Loss streak" value={String(item.lossStreak)} />
        <Mini label="Exposure" value={`${item.openExposureUsdt.toFixed(2)} USDT`} />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="label">Latest reason</div>
        <p className="mt-2 text-sm leading-6 text-slate-300">{item.latestReason}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{item.nextAction}</p>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="label">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-white">{value}</div>
    </div>
  );
}
