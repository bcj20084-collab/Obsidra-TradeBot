import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, RadioTower, RefreshCw, ShieldCheck, Sparkles, TimerReset } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, NoTradeDiagnosticItem } from "../lib/types";

export function WhyNoTradePanel() {
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
        if (alive) setError("Why-no-trade diagnostics unavailable");
      });
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const diagnostics = health?.noTradeDiagnostics;
  const items = diagnostics?.items ?? [];
  const counts = useMemo(() => ({
    ready: items.filter((item) => item.status === "READY").length,
    blocked: items.filter((item) => ["COOLING_DOWN", "PROTECTED", "PAUSED", "FILTERED"].includes(item.status)).length,
    waiting: items.filter((item) => ["WAITING", "SCANNING"].includes(item.status)).length,
    managing: items.filter((item) => item.status === "MANAGING").length,
  }), [items]);

  return (
    <section className="glass-card overflow-hidden">
      <div className="premium-hero-noise" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="hero-eyebrow">
            <Sparkles size={14} />
            Why no trade / Live decision brain
          </div>
          <h3 className="mt-3 text-3xl font-black tracking-tight text-white">De ce nu intră bot-ul acum?</h3>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
            {error || diagnostics?.summary || "Sincronizez diagnosticele din engine, risk gate și journal events."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <BrainStat label="Ready" value={counts.ready} tone="good" />
          <BrainStat label="Waiting" value={counts.waiting} tone="cyan" />
          <BrainStat label="Protected" value={counts.blocked} tone="warn" />
          <BrainStat label="Managing" value={counts.managing} tone="violet" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <TopReason icon={RadioTower} label="Signals 24h" value={`${diagnostics?.signalsReady24h ?? health?.signalsReady24h ?? 0} ready`} detail={`${diagnostics?.signalsSkipped24h ?? health?.signalsSkipped24h ?? 0} skipped/rejected`} />
        <TopReason icon={Clock3} label="Last trade age" value={formatHours(diagnostics?.lastTradeAgeHours ?? health?.lastTradeAgeHours ?? null)} detail={health?.latestTrade ? `${health.latestTrade.symbol} ${health.latestTrade.status}` : "No latest trade"} />
        <TopReason icon={ShieldCheck} label="Engine state" value={health?.botStatus ?? "SYNCING"} detail={health?.db ? "DB healthy / paper mode" : "DB check pending"} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {items.length ? items.map((item) => <DiagnosticCard item={item} key={item.strategyId} />) : (
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm text-slate-400 xl:col-span-3">
            <RefreshCw className="mb-3 animate-spin text-cyan" size={18} />
            Waiting for strategy diagnostics...
          </div>
        )}
      </div>
    </section>
  );
}

function DiagnosticCard({ item }: { item: NoTradeDiagnosticItem }) {
  const style = statusStyle(item.status);
  const StatusIcon = style.icon;
  return (
    <article className={`rounded-3xl border p-5 ${style.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] ${style.pill}`}>
              <StatusIcon size={13} />
              {item.status}
            </span>
            <span className="pill">{item.mode}</span>
          </div>
          <h4 className="mt-4 text-2xl font-black text-white">{item.symbol}</h4>
          <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{item.exchange} · {item.type}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-right">
          <div className="label">Loss streak</div>
          <div className={item.lossStreak >= 3 ? "font-mono text-xl font-black text-amber-200" : "font-mono text-xl font-black text-white"}>{item.lossStreak}</div>
        </div>
      </div>

      <p className="mt-4 min-h-[3rem] text-sm leading-6 text-slate-300">{item.reason}</p>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="label">Next action</div>
        <p className="mt-2 text-sm leading-6 text-slate-300">{item.nextAction}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Mini label="Latest signal" value={item.latestSignal ? `${item.latestSignal.reason} · ${item.latestSignal.ageMinutes}m` : "No recent signal"} />
        <Mini label="Next check" value={item.remainingCooldownMinutes ? `${item.remainingCooldownMinutes}m cooldown` : item.nextCheckAt ? formatDate(item.nextCheckAt) : "Market loop"} />
        <Mini label="Last close" value={item.lastClosedTrade ? `${formatSigned(item.lastClosedTrade.pnlUsdt)} USDT` : "No close yet"} />
        <Mini label="Health" value={item.healthLevel ?? (item.blockedUntil ? "COOLDOWN" : "LIVE")} />
      </div>

      {item.checklist?.length ? (
        <div className="mt-4 space-y-2">
          {item.checklist.slice(0, 4).map((check) => (
            <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm" key={check.name}>
              <CheckCircle2 className={check.passed ? "mt-0.5 text-emerald-300" : "mt-0.5 text-amber-300"} size={15} />
              <div>
                <div className="font-black text-white">{check.name}</div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500">{check.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function BrainStat({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "cyan" | "violet" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-200" : tone === "violet" ? "text-violet-200" : "text-cyan";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-center">
      <div className="label">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-black ${toneClass}`}>{value}</div>
    </div>
  );
}

function TopReason({ icon: Icon, label, value, detail }: { icon: typeof RadioTower; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-3">
        <div className="metric-icon tone-cyan"><Icon size={16} /></div>
        <div>
          <div className="label">{label}</div>
          <div className="mt-1 text-lg font-black text-white">{value}</div>
        </div>
      </div>
      <div className="mt-3 text-sm text-slate-500">{detail}</div>
    </div>
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

function statusStyle(status: string) {
  if (status === "READY") return { icon: CheckCircle2, card: "border-emerald-400/25 bg-emerald-400/10", pill: "bg-emerald-400/15 text-emerald-200" };
  if (status === "COOLING_DOWN") return { icon: TimerReset, card: "border-amber-400/25 bg-amber-400/10", pill: "bg-amber-400/15 text-amber-100" };
  if (["PROTECTED", "FILTERED", "PAUSED"].includes(status)) return { icon: LockKeyhole, card: "border-rose-400/25 bg-rose-400/10", pill: "bg-rose-400/15 text-rose-100" };
  if (status === "MANAGING") return { icon: ShieldCheck, card: "border-violet-400/25 bg-violet-400/10", pill: "bg-violet-400/15 text-violet-100" };
  return { icon: AlertTriangle, card: "border-cyan/20 bg-cyan/5", pill: "bg-cyan/10 text-cyan" };
}

function formatHours(value: number | null): string {
  if (value === null) return "n/a";
  if (value < 1) return `${Math.round(value * 60)}m`;
  return `${value.toFixed(1)}h`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSigned(value: number | null): string {
  if (value === null) return "0.00";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
