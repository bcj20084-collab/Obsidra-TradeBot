import { Activity, Bot, Clock3, RadioTower, ShieldCheck, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth } from "../lib/types";

export function DeepHealthPanel() {
  const [health, setHealth] = useState<DeepHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await fetchDeepHealth();
        if (!alive) return;
        setHealth(next);
        setError("");
      } catch {
        if (!alive) return;
        setError("Deep health offline");
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const open = health?.latestOpenTrade ?? null;
  const protection = open?.protection ?? null;
  const running = health?.ok && health.botStatus === "RUNNING" && health.db;

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label">Live bot black box</div>
          <h3 className="mt-2 text-2xl font-black">Execution heartbeat</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Public-safe diagnostics for bot status, current paper position and protection logic. No keys, no secrets.
          </p>
        </div>
        <span className={`pill ${running ? "pill-success" : "pill-danger"}`}>
          {error || (running ? "ONLINE" : health ? health.botStatus : "SYNCING")}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <HealthStat icon={Bot} label="Bot" value={health?.botStatus ?? "Loading"} detail={health?.botReason ?? "Waiting for API"} />
        <HealthStat icon={RadioTower} label="Signals 24h" value={`${health?.signalsReady24h ?? 0} ready`} detail={`${health?.signalsSkipped24h ?? 0} skipped / ${health?.riskRejected24h ?? 0} risk rejects`} />
        <HealthStat icon={Activity} label="Open paper trades" value={String(health?.openPositionsCount ?? 0)} detail={open ? `${open.symbol} ${open.direction}` : "No open position"} />
        <HealthStat icon={Clock3} label="Last update" value={health ? formatTime(health.timestamp) : "—"} detail={health ? `${Math.round(health.uptimeSeconds / 60)} min uptime` : "Polling every 15s"} />
      </div>

      {open ? (
        <div className="mt-5 rounded-3xl border border-cyan/15 bg-cyan/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Current paper position</div>
              <div className="mt-1 text-xl font-black text-white">{open.symbol} · {open.direction}</div>
            </div>
            <span className={open.direction === "LONG" ? "pill pill-success" : "pill pill-danger"}>{open.status}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <Mini label="Entry" value={formatPrice(open.entryPrice)} />
            <Mini label="SL" value={formatPrice(open.stopLoss)} />
            <Mini label="TP" value={formatPrice(open.takeProfit)} />
            <Mini label="Size" value={`${open.positionSizeUsdt.toFixed(2)} USDT`} />
            <Mini label="Score" value={`${open.signalScore}/100`} />
          </div>
          {protection ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Mini label="Now" value={formatPrice(protection.currentPrice)} />
              <Mini label="Unrealized PnL" value={`${formatSigned(protection.unrealizedPnlUsdt)} USDT`} />
              <Mini label="Profit R" value={protection.profitR == null ? "—" : `${protection.profitR.toFixed(2)}R`} />
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <ProtectionPill label="TP1" active={Boolean(protection?.tp1Hit)} />
            <ProtectionPill label="TP2" active={Boolean(protection?.tp2Hit)} />
            <ProtectionPill label="Breakeven" active={Boolean(protection?.breakevenMoved)} />
            <ProtectionPill label="Trailing" active={Boolean(protection?.trailingActivated)} />
          </div>
          {protection ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="pill">Partial PnL {formatSigned(protection.partialRealizedPnlUsdt)} USDT</span>
              <span className="pill">Fees {formatPrice(protection.partialFeeUsdt)}</span>
              <span className="pill">High {formatPrice(protection.highestPrice)}</span>
              <span className="pill">Low {formatPrice(protection.lowestPrice)}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-6 text-slate-400">
          No open paper position right now. The bot is still scanning; next valid signal will appear here.
        </div>
      )}
    </section>
  );
}

function HealthStat({ icon: Icon, label, value, detail }: { icon: typeof TrendingUp; label: string; value: string; detail: string }) {
  return (
    <div className="metric-tile">
      <Icon className="text-cyan" size={20} />
      <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-black">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function ProtectionPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-black/20 text-slate-500"}`}>
      <div className="flex items-center gap-2 text-sm font-bold">
        <ShieldCheck size={16} />
        {label}
      </div>
      <div className="mt-1 text-xs">{active ? "Activated" : "Waiting"}</div>
    </div>
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

function formatPrice(value: number | null | undefined): string {
  return value == null ? "—" : `$${value.toFixed(value > 100 ? 2 : 4)}`;
}

function formatSigned(value: number | null | undefined): string {
  if (value == null) return "0.00";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
