import { Activity, Bot, BrainCircuit, Clock3, RadioTower, ShieldCheck, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, LossBrainItem } from "../lib/types";

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
  const openTrades = health?.openTrades?.length ? health.openTrades : open ? [open] : [];
  const lossBrain = health?.latestLossBrain ?? [];
  const autoTuner = health?.autoTuner ?? [];
  const running = health?.ok && health.botStatus === "RUNNING" && health.db;

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label">Live bot black box</div>
          <h3 className="mt-2 text-2xl font-black">Execution heartbeat</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Public-safe diagnostics for bot status, current paper positions, protection logic and learning memory.
          </p>
        </div>
        <span className={`pill ${running ? "pill-success" : "pill-danger"}`}>
          {error || (running ? "ONLINE" : health ? health.botStatus : "SYNCING")}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <HealthStat icon={Bot} label="Bot" value={health?.botStatus ?? "Loading"} detail={health?.botReason ?? "Waiting for API"} />
        <HealthStat icon={RadioTower} label="Signals 24h" value={`${health?.signalsReady24h ?? 0} ready`} detail={`${health?.signalsSkipped24h ?? 0} skipped / ${health?.actionableRiskRejected24h ?? health?.riskRejected24h ?? 0} actionable rejects`} />
        <HealthStat icon={Activity} label="Open paper trades" value={String(health?.openPositionsCount ?? 0)} detail={open ? `${open.symbol} ${open.direction}` : "No open position"} />
        <HealthStat icon={Clock3} label="Last update" value={health ? formatTime(health.timestamp) : "—"} detail={health ? `${Math.round(health.uptimeSeconds / 60)} min uptime` : "Polling every 15s"} />
      </div>

      {health?.latestSignalEvent ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="label">Latest engine event</span>
              <div className="mt-1 font-bold text-white">{health.latestSignalEvent.type}</div>
            </div>
            <span className="pill">{formatTime(health.latestSignalEvent.createdAt)}</span>
          </div>
          <p className="mt-3 leading-6 text-slate-400">
            {eventSummary(health.latestSignalEvent.data)}
            {health.riskBlockedByOpenPosition24h ? ` · ${health.riskBlockedByOpenPosition24h} duplicate entries blocked in 24h` : ""}
          </p>
        </div>
      ) : null}

      {openTrades.length ? (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Premium risk map</div>
              <div className="mt-1 text-lg font-black text-white">Open position radar</div>
            </div>
            <span className="pill">{openTrades.length} active</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {openTrades.map((trade) => <RiskMapCard key={trade.id} trade={trade} />)}
          </div>
        </div>
      ) : null}

      {lossBrain.length ? (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Learning center</div>
              <div className="mt-1 text-lg font-black text-white">Loss brain memory</div>
            </div>
            <span className="pill">{lossBrain.length} analyses</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {lossBrain.slice(0, 4).map((item) => <LossBrainCard key={item.id} item={item} />)}
          </div>
        </div>
      ) : null}

      {autoTuner.length ? (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Auto strategy tuner</div>
              <div className="mt-1 text-lg font-black text-white">Active learning adjustments</div>
            </div>
            <span className="pill">{autoTuner.length} symbols tuned</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {autoTuner.map((item) => <TunerCard key={item.symbol} item={item} />)}
          </div>
        </div>
      ) : null}

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
              {protection.dangerAlerted ? <span className="pill pill-danger">Danger alert sent</span> : null}
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

function RiskMapCard({ trade }: { trade: NonNullable<DeepHealth["openTrades"]>[number] }) {
  const protection = trade.protection;
  const risk = riskStatus(protection?.profitR ?? null);
  return (
    <div className={`rounded-3xl border p-4 ${risk.className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-black text-white">{trade.symbol}</span>
            <span className={trade.direction === "LONG" ? "direction-badge direction-long" : "direction-badge direction-short"}>{trade.direction}</span>
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{trade.exchange} · {trade.executionMode}</div>
        </div>
        <span className={`pill ${risk.pill}`}>{risk.label}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <Mini label="Now" value={formatPrice(protection?.currentPrice)} />
        <Mini label="PnL" value={`${formatSigned(protection?.unrealizedPnlUsdt)} USDT`} />
        <Mini label="R" value={protection?.profitR == null ? "—" : `${protection.profitR.toFixed(2)}R`} />
        <Mini label="Size" value={`${trade.positionSizeUsdt.toFixed(2)} USDT`} />
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-slate-500">Distance to SL</div>
          <div className="mt-1 font-mono font-bold text-rose-200">{distancePct(protection?.currentPrice, trade.stopLoss)}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-slate-500">Distance to TP</div>
          <div className="mt-1 font-mono font-bold text-emerald-200">{distancePct(protection?.currentPrice, trade.takeProfit)}</div>
        </div>
      </div>
    </div>
  );
}

function LossBrainCard({ item }: { item: LossBrainItem }) {
  const severity = item.severity ?? "UNKNOWN";
  return (
    <div className={`rounded-3xl border p-4 ${severityClass(severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="metric-icon tone-cyan"><BrainCircuit size={17} /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-black text-white">{item.symbol}</span>
              {item.direction ? <span className={item.direction === "LONG" ? "direction-badge direction-long" : "direction-badge direction-short"}>{item.direction}</span> : null}
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{item.primaryCategory ?? "LOSS_ANALYSIS"} · {new Date(item.createdAt).toLocaleTimeString()}</div>
          </div>
        </div>
        <span className={`pill ${severity === "HIGH" ? "pill-danger" : severity === "LOW" ? "pill-success" : ""}`}>{severity}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <Mini label="PnL" value={item.pnlUsdt == null ? "—" : `${formatSigned(item.pnlUsdt)} USDT`} />
        <Mini label="Penalty" value={item.suggestedScorePenalty == null ? "—" : `+${item.suggestedScorePenalty}`} />
        <Mini label="Cooldown" value={item.suggestedCooldownMinutes == null ? "—" : `${item.suggestedCooldownMinutes}m`} />
        <Mini label="Confidence" value={item.confidence == null ? "—" : `${(item.confidence * 100).toFixed(0)}%`} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{item.summary ?? "Legacy loss analysis imported."}</p>
      {item.recommendations.length ? (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-400">
          {item.recommendations.slice(0, 2).map((recommendation) => <li key={recommendation}>• {recommendation}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function TunerCard({ item }: { item: NonNullable<DeepHealth["autoTuner"]>[number] }) {
  return (
    <div className={`rounded-3xl border p-4 ${tunerClass(item.mode)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-black text-white">{item.symbol}</span>
            <span className="pill">{item.lossCount24h} losses / 24h</span>
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{item.lastCategory ?? "LOSS_MEMORY"} · {new Date(item.updatedAt).toLocaleTimeString()}</div>
        </div>
        <span className={`pill ${item.mode === "DEFENSIVE" ? "pill-danger" : item.mode === "WATCH" ? "pill-success" : ""}`}>{item.mode}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <Mini label="Penalty" value={`+${item.scorePenaltyActive}`} />
        <Mini label="Cooldown" value={`${item.cooldownMinutesActive}m`} />
        <Mini label="Severity" value={item.maxSeverity} />
        <Mini label="Last PnL" value={item.lastPnlUsdt == null ? "—" : `${formatSigned(item.lastPnlUsdt)} USDT`} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{item.recommendation}</p>
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

function eventSummary(data: unknown): string {
  if (!data || typeof data !== "object") return "No event details yet.";
  const record = data as Record<string, unknown>;
  const symbol = stringFrom(record.symbol) ?? stringFrom((record.signal as Record<string, unknown> | undefined)?.symbol);
  const reason = stringFrom(record.reason) ?? stringFrom((record.decision as Record<string, unknown> | undefined)?.reason);
  if (reason === "Open position already exists") return `${symbol ?? "Signal"} was safely blocked because a position is already open.`;
  if (reason === "near_stop_loss") return `${symbol ?? "Position"} is close to stop loss.`;
  if (reason) return `${symbol ?? "Signal"}: ${reason}`;
  return symbol ? `${symbol} updated.` : "Engine heartbeat received.";
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function riskStatus(profitR: number | null) {
  if (profitR != null && profitR <= -0.8) return { label: "DANGER", pill: "pill-danger", className: "border-rose-500/35 bg-rose-500/10" };
  if (profitR != null && profitR <= -0.4) return { label: "WARNING", pill: "", className: "border-amber-400/30 bg-amber-400/10" };
  if (profitR != null && profitR >= 0.8) return { label: "PROFIT", pill: "pill-success", className: "border-emerald-400/30 bg-emerald-400/10" };
  return { label: "STABLE", pill: "", className: "border-cyan/15 bg-cyan/5" };
}

function severityClass(severity: string) {
  if (severity === "HIGH") return "border-rose-500/35 bg-rose-500/10";
  if (severity === "MEDIUM") return "border-amber-400/30 bg-amber-400/10";
  if (severity === "LOW") return "border-emerald-400/30 bg-emerald-400/10";
  return "border-white/10 bg-black/20";
}

function tunerClass(mode: string) {
  if (mode === "DEFENSIVE") return "border-rose-500/35 bg-rose-500/10";
  if (mode === "CAUTIOUS") return "border-amber-400/30 bg-amber-400/10";
  if (mode === "WATCH") return "border-emerald-400/30 bg-emerald-400/10";
  return "border-cyan/15 bg-cyan/5";
}

function distancePct(current: number | null | undefined, target: number | null | undefined): string {
  if (!current || !target) return "—";
  return `${((Math.abs(current - target) / current) * 100).toFixed(2)}%`;
}
