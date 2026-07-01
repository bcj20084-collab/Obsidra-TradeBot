import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, Clock3, RadioTower, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { AiActivityCommand } from "../components/AiActivityCommand";
import { DeepHealthPanel } from "../components/DeepHealthPanel";
import { PremiumIntelligence } from "../components/PremiumIntelligence";
import { SafetySupervisor } from "../components/SafetySupervisor";
import { SignalDiagnostics } from "../components/SignalDiagnostics";
import { StrategyOptimizerCenter } from "../components/StrategyOptimizerCenter";
import { SystemDeployCenter } from "../components/SystemDeployCenter";
import { TopBotParity } from "../components/TopBotParity";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, Metrics, SignalFeedItem, Trade } from "../lib/types";

export function AiBrain({ metrics, trades, signals }: { metrics: Metrics; trades: Trade[]; signals: SignalFeedItem[] }) {
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
        if (alive) setError("Deep health sync unavailable");
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const score = useMemo(() => calculateHealthScore(metrics, health), [metrics, health]);
  const noTrade = noTradeReason(health, signals, trades);
  const closed = trades.filter((trade) => trade.status === "CLOSED");
  const wins = closed.filter((trade) => (trade.pnlUsdt ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <section className="ai-brain-hero glass-card">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="hero-eyebrow">
              <Sparkles size={14} />
              Obsidra AI Brain
            </div>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white md:text-5xl">
              Creierul botului: de ce intră, de ce așteaptă, ce învață.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
              Tot ce era greu în dashboard stă aici: health score, no-trade reason, loss brain, tuner, safety, deploy și signal diagnostics.
            </p>
          </div>
          <div className={`ai-score-orb ${score >= 80 ? "ai-score-good" : score >= 55 ? "ai-score-warn" : "ai-score-bad"}`}>
            <span>{score}</span>
            <small>Health score</small>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <BrainStat icon={ShieldCheck} label="Safety" value={metrics.safetySupervisor?.level ?? "SYNC"} detail={metrics.safetySupervisor?.summary ?? "Waiting for supervisor"} />
          <BrainStat icon={RadioTower} label="Signals 24h" value={String(health?.signalsReady24h ?? metrics.signalsGenerated24h ?? 0)} detail={`${health?.signalsSkipped24h ?? metrics.signalsRejected24h ?? 0} skipped`} />
          <BrainStat icon={TrendingUp} label="Closed trades" value={String(closed.length)} detail={`${wins} wins / ${Math.max(0, closed.length - wins)} losses`} />
          <BrainStat icon={Clock3} label="Last trade age" value={health?.lastTradeAgeHours == null ? "—" : `${health.lastTradeAgeHours.toFixed(1)}h`} detail={health?.botStatus ?? metrics.botStatus} />
        </div>
      </section>

      <section className="ai-brain-grid">
        <div className="glass-card no-trade-panel">
          <div className="flex items-start gap-4">
            <div className="metric-icon tone-amber">
              <AlertTriangle size={18} />
            </div>
            <div>
              <div className="label">No-trade reason</div>
              <h3 className="mt-2 text-2xl font-black text-white">{noTrade.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{noTrade.detail}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Mini label="Ready signals" value={String(health?.signalsReady24h ?? metrics.signalsGenerated24h ?? 0)} />
            <Mini label="Risk rejected" value={String(health?.actionableRiskRejected24h ?? health?.riskRejected24h ?? 0)} />
            <Mini label="Open positions" value={String(health?.openPositionsCount ?? metrics.openPositionsCount ?? 0)} />
          </div>
        </div>

        <div className="glass-card">
          <div className="label">Next best action</div>
          <h3 className="mt-2 text-2xl font-black text-white">{nextAction(score, noTrade.kind)}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Dashboard-ul separă cockpit-ul de creier: Mission Control rămâne curat, iar aici vezi explicațiile și debugging-ul profund.
          </p>
          {error ? <div className="mt-4 pill pill-danger">{error}</div> : <div className="mt-4 pill pill-success">Deep health online</div>}
        </div>
      </section>

      <PremiumIntelligence metrics={metrics} trades={trades} signals={signals} />
      <AiActivityCommand metrics={metrics} trades={trades} signals={signals} />
      <DeepHealthPanel />
      <SafetySupervisor status={metrics.safetySupervisor} />
      <SignalDiagnostics signals={signals} />
      <StrategyOptimizerCenter metrics={metrics} trades={trades} />
      <SystemDeployCenter />
      <TopBotParity />
    </div>
  );
}

function calculateHealthScore(metrics: Metrics, health: DeepHealth | null): number {
  let score = 100;
  if (metrics.botStatus !== "RUNNING") score -= 35;
  if (health && !health.db) score -= 20;
  if (metrics.currentDrawdown > 3) score -= Math.min(18, metrics.currentDrawdown * 2);
  if (metrics.profitFactor > 0 && metrics.profitFactor < 1) score -= 14;
  if ((health?.actionableRiskRejected24h ?? 0) > 20) score -= 8;
  if ((health?.lastTradeAgeHours ?? 0) > 24) score -= 10;
  if (metrics.safetySupervisor?.level === "DANGER") score -= 25;
  if (metrics.safetySupervisor?.level === "WATCH") score -= 10;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function noTradeReason(health: DeepHealth | null, signals: SignalFeedItem[], trades: Trade[]): { title: string; detail: string; kind: string } {
  if (health?.openPositionsCount) {
    return { title: "Botul gestionează poziții deschise", detail: "Nu forțează intrări noi cât timp există expunere activă sau risc de duplicate.", kind: "open" };
  }
  if (health?.pullbackControl?.reason) {
    return { title: `${health.pullbackControl.symbol} așteaptă setup valid`, detail: health.pullbackControl.reason, kind: "waiting" };
  }
  if ((health?.actionableRiskRejected24h ?? 0) > 0) {
    return { title: "Risk gate blochează setup-uri slabe", detail: `${health?.actionableRiskRejected24h} setup-uri au fost respinse în ultimele 24h pentru protecție.`, kind: "risk" };
  }
  const latestSignal = signals[0];
  if (latestSignal) {
    return { title: `Ultimul semnal: ${latestSignal.status ?? latestSignal.type}`, detail: `${latestSignal.symbol}: ${latestSignal.reason}`, kind: "signal" };
  }
  if (!trades.length) {
    return { title: "Așteaptă primul setup calificat", detail: "Nu există încă trade-uri în feed. Scannerul rulează și va intra doar când edge-ul trece filtrele.", kind: "idle" };
  }
  return { title: "Scanner activ, fără intrare nouă", detail: "Botul citește piața și va executa doar când trendul, scorul și riscul sunt aliniate.", kind: "idle" };
}

function nextAction(score: number, kind: string): string {
  if (score < 55) return "Verifică risk, loss brain și cooldown-urile înainte de optimizare.";
  if (kind === "waiting") return "Lasă botul să aștepte confirmarea; nu forța intrarea.";
  if (kind === "risk") return "Uită-te la setup-urile respinse și ajustează strategia doar după date.";
  return "Continuă paper test și strânge sample mai mare pentru strategie.";
}

function BrainStat({ icon: Icon, label, value, detail }: { icon: typeof BrainCircuit; label: string; value: string; detail: string }) {
  return (
    <div className="brain-stat">
      <Icon className="text-cyan" size={18} />
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 truncate font-mono text-xl font-black text-white">{value}</div>
      <div className="mt-1 line-clamp-2 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="label">{label}</div>
      <div className="mt-2 font-mono text-lg font-black text-white">{value}</div>
    </div>
  );
}
