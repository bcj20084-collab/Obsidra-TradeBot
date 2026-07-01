import { useEffect, useMemo, useState } from "react";
import { Activity, BrainCircuit, Gauge, RadioTower, ShieldCheck, Sparkles, TrendingUp, Zap } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, Metrics, SignalFeedItem, Trade } from "../lib/types";

export function ObsidraCommandCenter({
  metrics,
  trades,
  signals,
}: {
  metrics: Metrics;
  trades: Trade[];
  signals: SignalFeedItem[];
}) {
  const [health, setHealth] = useState<DeepHealth | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void fetchDeepHealth().then((next) => {
      if (alive) setHealth(next);
    }).catch(() => undefined);
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const closed = trades.filter((trade) => trade.status === "CLOSED");
  const open = trades.filter((trade) => ["OPEN", "FILLED", "CLOSING"].includes(trade.status));
  const latestSignal = signals[0];
  const pullback = health?.pullbackControl;
  const pnlTone = metrics.totalPnlUsdt >= 0 ? "good" : "bad";
  const riskTone = metrics.currentDrawdown <= 3 ? "good" : metrics.currentDrawdown <= 8 ? "warn" : "bad";
  const systemScore = useMemo(() => {
    let score = 100;
    if (metrics.botStatus !== "RUNNING") score -= 35;
    if (!health?.db) score -= 20;
    if ((health?.actionableRiskRejected24h ?? 0) > 20) score -= 10;
    if (metrics.currentDrawdown > 8) score -= 15;
    if (pullback?.healthLevel === "DANGER") score -= 20;
    if (pullback?.healthLevel === "WATCH") score -= 8;
    return Math.max(0, Math.min(100, score));
  }, [health?.actionableRiskRejected24h, health?.db, metrics.botStatus, metrics.currentDrawdown, pullback?.healthLevel]);
  const systemTone = systemScore >= 80 ? "good" : systemScore >= 55 ? "warn" : "bad";

  return (
    <section className="obs-command-center">
      <div className="obs-command-hero">
        <div className="hero-eyebrow">
          <Sparkles size={14} />
          Obsidra premium command center
        </div>
        <h2 className="obs-command-title">AI Trading cockpit, dar pe stil Obsidra.</h2>
        <p className="obs-command-sub">
          Inspirat din dashboard-ul vechi, reconstruit mai premium cu date reale: strategy health, paper execution, risk, signals și deploy state.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="pill pill-success">Paper protected</span>
          <span className="pill">{health?.deploy?.commitSha ? health.deploy.commitSha.slice(0, 8) : "deploy sync"}</span>
          <span className="pill">{pullback?.symbol ?? "DOGEUSDT"} Pullback OS</span>
        </div>
      </div>

      <div className="obs-command-grid">
        <CommandTile
          icon={Gauge}
          label="System score"
          value={`${systemScore}%`}
          detail={`${metrics.botStatus} / DB ${health?.db ? "OK" : "SYNC"}`}
          tone={systemTone}
        />
        <CommandTile
          icon={TrendingUp}
          label="Net PnL"
          value={`${formatSigned(metrics.totalPnlUsdt)} USDT`}
          detail={`${closed.length} closed / ${metrics.winRate.toFixed(1)}% WR`}
          tone={pnlTone}
        />
        <CommandTile
          icon={Zap}
          label="Execution"
          value={`${open.length} open`}
          detail={`${metrics.tradesLast24h} trades last 24h`}
          tone={open.length ? "warn" : "good"}
        />
        <CommandTile
          icon={RadioTower}
          label="Signals"
          value={`${health?.signalsReady24h ?? metrics.signalsGenerated24h ?? 0}`}
          detail={latestSignal ? `${latestSignal.symbol} ${latestSignal.type}` : "waiting for feed"}
          tone="cyan"
        />
        <CommandTile
          icon={ShieldCheck}
          label="Risk"
          value={`${metrics.currentDrawdown.toFixed(2)}% DD`}
          detail={`${health?.actionableRiskRejected24h ?? 0} actionable rejects`}
          tone={riskTone}
        />
        <CommandTile
          icon={BrainCircuit}
          label="Pullback brain"
          value={pullback ? `${pullback.edgeScore}/100` : "sync"}
          detail={pullback ? `${pullback.healthLevel} / ${pullback.direction}` : "loading deep health"}
          tone={pullback?.healthLevel === "DANGER" ? "bad" : pullback?.healthLevel === "WATCH" ? "warn" : "good"}
        />
      </div>
    </section>
  );
}

function CommandTile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "bad" | "cyan";
}) {
  return (
    <div className={`obs-command-tile obs-command-${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="obs-command-icon">
          <Icon size={17} />
        </div>
        <span className="obs-command-pulse" />
      </div>
      <div>
        <div className="label">{label}</div>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
