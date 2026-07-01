import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock3, RadioTower, ShieldAlert, Sparkles, TrendingUp, XCircle } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, Metrics, SignalFeedItem, Trade } from "../lib/types";

type ActivityTone = "good" | "warn" | "bad" | "cyan";

interface ActivityItem {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: ActivityTone;
  badge: string;
}

export function AiActivityCommand({
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

  const activities = useMemo(() => buildActivities(signals, trades, health), [signals, trades, health]);
  const verdict = buildVerdict(metrics, health, signals);
  const latestLoss = health?.latestLossBrain?.[0] ?? null;
  const tuner = health?.autoTuner?.[0] ?? null;

  return (
    <section className="ai-activity-grid">
      <div className="ai-activity-panel glass-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="hero-eyebrow">
              <RadioTower size={14} />
              Live activity feed
            </div>
            <h3 className="mt-3 text-3xl font-black text-white">Ce face bot-ul chiar acum</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Feed premium cu scanări, semnale, risk blocks, trade-uri, learning și health — pe înțelesul tău, nu raw logs.
            </p>
          </div>
          <span className="pill">{activities.length} live events</span>
        </div>

        <div className="ai-activity-timeline mt-6">
          {activities.slice(0, 10).map((item) => (
            <div className="ai-activity-row" key={item.id}>
              <div className={`ai-activity-dot ai-activity-${item.tone}`} />
              <div className="ai-activity-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {iconForTone(item.tone)}
                    <span className="font-black text-white">{item.title}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`pill ${item.tone === "good" ? "pill-success" : item.tone === "bad" ? "pill-danger" : ""}`}>{item.badge}</span>
                    <span className="pill">{formatClock(item.time)}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
              </div>
            </div>
          ))}
          {!activities.length ? (
            <div className="empty-state">
              <div className="text-lg font-bold text-white">Waiting for engine activity</div>
              <p className="mt-2 text-sm text-slate-400">The next scan, signal or trade event will appear here.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ai-decision-panel glass-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="hero-eyebrow">
              <BrainCircuit size={14} />
              AI decisions
            </div>
            <h3 className="mt-3 text-3xl font-black text-white">{verdict.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{verdict.detail}</p>
          </div>
          <div className={`ai-verdict-score ai-verdict-${verdict.tone}`}>{verdict.score}</div>
        </div>

        <div className="mt-6 grid gap-3">
          <DecisionLine
            icon={ShieldAlert}
            label="Risk posture"
            value={metrics.currentDrawdown <= 3 ? "Protected" : metrics.currentDrawdown <= 8 ? "Watch" : "Danger"}
            detail={`Drawdown ${metrics.currentDrawdown.toFixed(2)}%, actionable rejects ${health?.actionableRiskRejected24h ?? 0}`}
          />
          <DecisionLine
            icon={TrendingUp}
            label="Strategy reality"
            value={health?.pullbackControl?.forwardReport.level ?? "WAITING"}
            detail={health?.pullbackControl?.forwardReport.summary ?? "Waiting for DOGE Pullback closed trades."}
          />
          <DecisionLine
            icon={Clock3}
            label="Next best action"
            value={verdict.action}
            detail={verdict.actionDetail}
          />
        </div>

        {latestLoss ? (
          <div className="mt-5 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-4">
            <div className="flex items-center gap-2 font-black text-white">
              <AlertTriangle className="text-rose-300" size={17} />
              Latest learning memory
            </div>
            <p className="mt-2 text-sm leading-6 text-rose-100/85">{latestLoss.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="pill pill-danger">{latestLoss.primaryCategory ?? "LOSS"}</span>
              {latestLoss.suggestedScorePenalty ? <span className="pill">+{latestLoss.suggestedScorePenalty} score</span> : null}
              {latestLoss.suggestedCooldownMinutes ? <span className="pill">{latestLoss.suggestedCooldownMinutes}m cooldown</span> : null}
            </div>
          </div>
        ) : null}

        {tuner ? (
          <div className="mt-4 rounded-[1.5rem] border border-cyan/15 bg-cyan/5 p-4">
            <div className="flex items-center gap-2 font-black text-white">
              <Sparkles className="text-cyan" size={17} />
              Auto-learning mode: {tuner.mode}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{tuner.recommendation}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function buildActivities(signals: SignalFeedItem[], trades: Trade[], health: DeepHealth | null): ActivityItem[] {
  const signalItems: ActivityItem[] = signals.slice(0, 8).map((item) => ({
    id: `signal:${item.id}`,
    time: item.createdAt,
    title: `${item.symbol} ${human(item.type)}`,
    detail: signalDetail(item),
    tone: toneForSignal(item),
    badge: item.direction || item.type.replace("SIGNAL_", ""),
  }));
  const tradeItems: ActivityItem[] = trades.slice(0, 5).map((trade) => ({
    id: `trade:${trade.id}`,
    time: trade.closedAt ?? trade.openedAt ?? trade.createdAt,
    title: `${trade.symbol} ${trade.status}`,
    detail: trade.status === "CLOSED"
      ? `${trade.direction} closed ${formatSigned(trade.pnlUsdt ?? 0)} USDT (${trade.closeReason ?? "closed"})`
      : `${trade.direction} opened @ ${formatPrice(trade.entryPrice)} | SL ${formatPrice(trade.stopLoss)} | TP ${formatPrice(trade.takeProfit)}`,
    tone: trade.status === "CLOSED" ? ((trade.pnlUsdt ?? 0) >= 0 ? "good" : "bad") : "cyan",
    badge: trade.executionMode ?? "PAPER",
  }));
  const learningItems: ActivityItem[] = (health?.latestLossBrain ?? []).slice(0, 2).map((item) => ({
    id: `loss:${item.id}`,
    time: item.createdAt,
    title: `${item.symbol} loss brain`,
    detail: item.summary ?? "Loss analysis generated.",
    tone: item.severity === "HIGH" ? "bad" : "warn",
    badge: item.primaryCategory ?? "LEARNING",
  }));
  const pullback = health?.pullbackControl;
  const pullbackItem: ActivityItem[] = pullback ? [{
    id: "pullback-control",
    time: health?.timestamp ?? new Date().toISOString(),
    title: `${pullback.symbol} Pullback brain`,
    detail: pullback.reason,
    tone: pullback.status === "SETUP_READY" ? "good" : pullback.healthLevel === "DANGER" ? "bad" : "cyan",
    badge: `${pullback.edgeScore}/100`,
  }] : [];
  return [...pullbackItem, ...signalItems, ...tradeItems, ...learningItems]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function buildVerdict(metrics: Metrics, health: DeepHealth | null, signals: SignalFeedItem[]) {
  let score = 100;
  if (metrics.botStatus !== "RUNNING") score -= 35;
  if (!health?.db) score -= 20;
  if (metrics.currentDrawdown > 8) score -= 20;
  if ((health?.actionableRiskRejected24h ?? 0) > 20) score -= 8;
  if (health?.pullbackControl?.healthLevel === "DANGER") score -= 20;
  const finalScore = Math.max(0, Math.min(100, score));
  const ready = signals.some((item) => item.type === "SIGNAL_READY" || item.type === "SIGNAL_GENERATED");
  if (finalScore >= 80) {
    return {
      score: finalScore,
      tone: "good" as const,
      title: ready ? "Botul găsește oportunități, dar rămâne protejat." : "Botul e sănătos și așteaptă setup curat.",
      detail: "Risk gates, paper mode și health checks sunt active. Nu forțează intrări când setup-ul nu e valid.",
      action: "Keep scanning",
      actionDetail: "Lasă botul să aștepte confirmarea RSI/trend; nu coborî filtrele încă.",
    };
  }
  if (finalScore >= 55) {
    return {
      score: finalScore,
      tone: "warn" as const,
      title: "Botul e în watch mode.",
      detail: "Există semnale/rejecturi sau drawdown care cer atenție, dar sistemul nu e într-o stare critică.",
      action: "Watch risk",
      actionDetail: "Păstrează paper mode și urmărește următoarele 3-5 trade-uri în dashboard.",
    };
  }
  return {
    score: finalScore,
    tone: "bad" as const,
    title: "Botul cere mod defensiv.",
    detail: "Health/risk/learning indică o stare sensibilă. Nu crește mărimea pozițiilor.",
    action: "Defensive only",
    actionDetail: "Menține cooldown/score penalty și nu activa live trading.",
  };
}

function DecisionLine({ icon: Icon, label, value, detail }: { icon: typeof BrainCircuit; label: string; value: string; detail: string }) {
  return (
    <div className="decision-line">
      <div className="metric-icon tone-cyan"><Icon size={16} /></div>
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className="mt-1 truncate text-lg font-black text-white">{value}</div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function signalDetail(item: SignalFeedItem): string {
  if (item.type === "RISK_REJECTED") return `${human(item.reason)} | score ${item.score ?? "-"} | ${item.regime || "regime unknown"}`;
  if (item.type === "SIGNAL_SKIPPED") return `${human(item.reason)} | price ${formatPrice(item.price)} | ${item.regime || "scanning"}`;
  return `${item.direction || "SIGNAL"} score ${item.score ?? "-"} | entry ${formatPrice(item.price)} | SL ${formatPrice(item.stopLoss)} | TP ${formatPrice(item.takeProfit)}`;
}

function toneForSignal(item: SignalFeedItem): ActivityTone {
  if (item.type === "SIGNAL_READY" || item.type === "SIGNAL_GENERATED") return "good";
  if (item.type === "RISK_REJECTED") return "bad";
  if (item.type.includes("DANGER")) return "bad";
  if (item.type.includes("PROTECTION")) return "warn";
  return "cyan";
}

function iconForTone(tone: ActivityTone) {
  if (tone === "good") return <CheckCircle2 className="text-emerald-300" size={17} />;
  if (tone === "bad") return <XCircle className="text-rose-300" size={17} />;
  if (tone === "warn") return <AlertTriangle className="text-amber-300" size={17} />;
  return <BrainCircuit className="text-cyan" size={17} />;
}

function human(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatClock(value: string): string {
  return new Date(value).toLocaleTimeString();
}

function formatPrice(value: number | null): string {
  if (value == null) return "-";
  return value >= 100 ? value.toFixed(2) : value.toFixed(5);
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
