import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bot, Clock3, RadioTower, ShieldCheck, TrendingUp } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth } from "../lib/types";

export function OperatorReportPanel() {
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
        if (alive) setError("Operator report unavailable");
      });
    load();
    const timer = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const report = health?.operatorReport24h;
  const watchdog = health?.readyWatchdog;
  const watch = watchdog?.level === "WATCH";

  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="hero-eyebrow">
            <Bot size={14} />
            Operator report / 24h intelligence
          </div>
          <h3 className="mt-3 text-3xl font-black text-white">Raport mare pentru ultimele 24h</h3>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
            {error || report?.recommendation || "Sincronizez PnL, semnale, risk gate și watchdog."}
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${watch ? "bg-amber-400/15 text-amber-100" : "bg-emerald-400/15 text-emerald-200"}`}>
          {watch ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
          {watchdog?.level ?? report?.level ?? "SYNCING"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <ReportStat icon={TrendingUp} label="PnL 24h" value={`${formatSigned(report?.pnlUsdt ?? 0)} USDT`} tone={(report?.pnlUsdt ?? 0) >= 0 ? "good" : "bad"} />
        <ReportStat icon={BarChart3} label="Trades" value={String(report?.trades ?? 0)} detail={`${report?.wins ?? 0}W / ${report?.losses ?? 0}L`} />
        <ReportStat icon={RadioTower} label="Signals" value={`${report?.signalsReady24h ?? health?.signalsReady24h ?? 0} ready`} detail={`${report?.signalsSkipped24h ?? health?.signalsSkipped24h ?? 0} skipped`} />
        <ReportStat icon={Clock3} label="Last trade" value={formatHours(report?.lastTradeAgeHours ?? health?.lastTradeAgeHours ?? null)} detail={`${report?.riskRejected24h ?? health?.riskRejected24h ?? 0} risk rejects`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_.9fr]">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <div className="label">Main blocker</div>
          <p className="mt-3 text-lg font-black leading-7 text-white">{report?.topBlocker ?? health?.noTradeDiagnostics?.summary ?? "Waiting for report data"}</p>
          <div className="mt-4 rounded-2xl border border-cyan/15 bg-cyan/5 p-4 text-sm leading-6 text-slate-300">
            {report?.recommendation ?? "Botul rămâne în paper mode și adună date pentru următoarea decizie."}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <div className="label">Ready watchdog</div>
          <div className="mt-3 text-2xl font-black text-white">{watchdog?.summary ?? "Waiting"}</div>
          <div className="mt-4 space-y-2">
            {(watchdog?.items ?? []).slice(0, 3).map((item) => (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3" key={item.strategyId}>
                <div>
                  <div className="font-black text-white">{item.symbol}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.reason}</div>
                </div>
                <span className={`pill ${item.status === "WATCH" ? "pill-danger" : item.status === "READY" ? "pill-success" : ""}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportStat({ icon: Icon, label, value, detail, tone }: { icon: typeof Activity; label: string; value: string; detail?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className={`metric-icon ${tone === "good" ? "tone-emerald" : tone === "bad" ? "tone-rose" : "tone-cyan"}`}><Icon size={16} /></div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 truncate text-xl font-black text-white">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatHours(value: number | null): string {
  if (value === null) return "n/a";
  if (value < 1) return `${Math.round(value * 60)}m`;
  return `${value.toFixed(1)}h`;
}
