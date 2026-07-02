import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Clock3, Crosshair, RadioTower, ShieldCheck, Target, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, DeepOpenTrade } from "../lib/types";

export function OpenTradeMonitor() {
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
        if (alive) setError("Live position sync unavailable");
      }
    };

    void load();
    const timer = setInterval(() => void load(), 12_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const trade = health?.latestOpenTrade ?? health?.openTrades?.[0] ?? null;
  const latestSignal = describeLatestSignal(health);

  if (!trade) {
    return (
      <section className="open-trade-monitor open-trade-monitor-empty">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="hero-eyebrow">
              <RadioTower size={14} />
              Open Trade Monitor
            </div>
            <h3 className="mt-3 text-3xl font-black text-white">No open paper position right now.</h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Botul scaneaza piata si asteapta un setup valid. Cand intra intr-un trade, panoul acesta devine harta live a pozitiei.
            </p>
          </div>
          <span className={`pill ${error ? "pill-danger" : "pill-success"}`}>{error || "scanner online"}</span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <MonitorStat icon={Activity} label="Ready signals 24h" value={String(health?.signalsReady24h ?? 0)} />
          <MonitorStat icon={ShieldCheck} label="Risk rejected 24h" value={String(health?.actionableRiskRejected24h ?? health?.riskRejected24h ?? 0)} />
          <MonitorStat icon={Clock3} label="Last trade age" value={health?.lastTradeAgeHours == null ? "-" : `${health.lastTradeAgeHours.toFixed(1)}h`} />
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">
          <span className="font-black text-white">Latest reason:</span> {latestSignal}
        </div>
      </section>
    );
  }

  return <ActiveTradeMonitor trade={trade} error={error} />;
}

function ActiveTradeMonitor({ trade, error }: { trade: DeepOpenTrade; error: string }) {
  const model = useMemo(() => buildTradeModel(trade), [trade]);
  const DirectionIcon = model.isLong ? TrendingUp : TrendingDown;

  return (
    <section className="open-trade-monitor">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="hero-eyebrow">
            <Crosshair size={14} />
            Open Trade Monitor
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h3 className="text-3xl font-black text-white md:text-4xl">{trade.symbol}</h3>
            <span className={`direction-badge ${model.isLong ? "direction-long" : "direction-short"}`}>
              <DirectionIcon size={14} />
              {trade.direction}
            </span>
            <span className="pill">{trade.executionMode}</span>
            <span className={`pill ${error ? "pill-danger" : "pill-success"}`}>{error || trade.status}</span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Live paper position map: entry, current price, stop, target, protection events and risk/reward progress.
          </p>
        </div>

        <div className={`trade-monitor-pnl ${model.pnl >= 0 ? "trade-monitor-pnl-good" : "trade-monitor-pnl-bad"}`}>
          <span>{formatSigned(model.pnl)} USDT</span>
          <small>{formatSigned(model.profitR)}R live</small>
        </div>
      </div>

      <div className="trade-monitor-grid mt-6">
        <MonitorStat icon={Target} label="Entry" value={`$${formatPrice(model.entry)}`} detail={`Score ${trade.signalScore}`} />
        <MonitorStat icon={RadioTower} label="Current" value={`$${formatPrice(model.current)}`} detail={timeAgo(trade.updatedAt)} />
        <MonitorStat icon={AlertTriangle} label="Stop loss" value={`$${formatPrice(trade.stopLoss)}`} detail={`${model.riskPct.toFixed(2)}% risk`} tone="rose" />
        <MonitorStat icon={ShieldCheck} label="Take profit" value={`$${formatPrice(trade.takeProfit)}`} detail={`${model.rewardPct.toFixed(2)}% target`} tone="emerald" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div className="trade-monitor-map">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Risk map</div>
              <h4 className="mt-1 text-xl font-black text-white">{model.isLong ? "SL -> Entry -> TP" : "TP -> Entry -> SL"}</h4>
            </div>
            <span className={`pill ${model.profitR >= 0 ? "pill-success" : "pill-danger"}`}>{formatSigned(model.profitR)}R</span>
          </div>

          <div className="trade-monitor-bar mt-6">
            <span className="trade-monitor-marker" style={{ left: `${model.marker}%` }} />
            <span className="trade-monitor-entry" style={{ left: `${model.entryMarker}%` }} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <span>{model.leftLabel}</span>
            <span>Entry</span>
            <span>{model.rightLabel}</span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <MiniMetric label="Size" value={`${trade.positionSizeUsdt.toFixed(2)} USDT`} />
            <MiniMetric label="Leverage" value={`${trade.leverage}x`} />
            <MiniMetric label="Opened" value={timeAgo(trade.openedAt)} />
            <MiniMetric label="Exchange" value={trade.exchange.toUpperCase()} />
          </div>
        </div>

        <div className="trade-monitor-map">
          <div className="label">Protections</div>
          <h4 className="mt-1 text-xl font-black text-white">Paper safety state</h4>
          <div className="protection-grid mt-5">
            <Protection active={Boolean(trade.protection?.tp1Hit)} label="TP1 hit" />
            <Protection active={Boolean(trade.protection?.tp2Hit)} label="TP2 hit" />
            <Protection active={Boolean(trade.protection?.breakevenMoved)} label="Breakeven" />
            <Protection active={Boolean(trade.protection?.trailingActivated)} label="Trailing" />
            <Protection active={Boolean(trade.protection?.dangerAlerted)} label="Danger alert" danger />
          </div>
          <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">
            <span className="font-black text-white">Trade age:</span> {timeAgo(trade.openedAt)}. Botul ramane in paper mode si gestioneaza pozitia dupa regulile SL/TP si protectii.
          </div>
        </div>
      </div>
    </section>
  );
}

function buildTradeModel(trade: DeepOpenTrade) {
  const entry = trade.entryPrice ?? trade.protection?.currentPrice ?? 0;
  const current = trade.protection?.currentPrice ?? entry;
  const isLong = trade.direction.toUpperCase() === "LONG";
  const pnl = trade.protection?.unrealizedPnlUsdt ?? 0;
  const profitR = trade.protection?.profitR ?? 0;
  const low = Math.min(trade.stopLoss, trade.takeProfit);
  const high = Math.max(trade.stopLoss, trade.takeProfit);
  const marker = normalize(current, low, high);
  const entryMarker = normalize(entry, low, high);
  const riskPct = entry > 0 ? Math.abs((entry - trade.stopLoss) / entry) * 100 : 0;
  const rewardPct = entry > 0 ? Math.abs((trade.takeProfit - entry) / entry) * 100 : 0;

  return {
    current,
    entry,
    entryMarker,
    isLong,
    leftLabel: isLong ? "Stop" : "Target",
    marker,
    pnl,
    profitR,
    rewardPct,
    rightLabel: isLong ? "Target" : "Stop",
    riskPct,
  };
}

function MonitorStat({ icon: Icon, label, value, detail, tone = "cyan" }: { icon: LucideIcon; label: string; value: string; detail?: string; tone?: "cyan" | "emerald" | "rose" }) {
  return (
    <div className="trade-monitor-stat">
      <div className={`metric-icon tone-${tone}`}>
        <Icon size={18} />
      </div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 truncate font-mono text-xl font-black text-white">{value}</div>
      {detail ? <div className="mt-1 line-clamp-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="label">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-black text-white">{value}</div>
    </div>
  );
}

function Protection({ active, label, danger = false }: { active: boolean; label: string; danger?: boolean }) {
  return (
    <div className={`protection-pill ${active ? (danger ? "protection-pill-danger" : "protection-pill-active") : "protection-pill-inactive"}`}>
      {active ? "ON" : "OFF"} · {label}
    </div>
  );
}

function describeLatestSignal(health: DeepHealth | null): string {
  const data = health?.latestSignalEvent?.data;
  if (typeof data === "object" && data && "reason" in data && typeof (data as { reason?: unknown }).reason === "string") {
    return (data as { reason: string }).reason;
  }
  if (health?.pullbackControl?.reason) return health.pullbackControl.reason;
  if (health?.botReason) return health.botReason;
  return "No fresh blocking reason received yet.";
}

function normalize(value: number, low: number, high: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) return 50;
  return Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function timeAgo(value: string | null): string {
  if (!value) return "-";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "-";
  const diffMs = Date.now() - time;
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)}h ago`;
  return `${(hours / 24).toFixed(1)}d ago`;
}
