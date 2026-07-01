import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, FlaskConical, Gauge, Radar, ShieldAlert, TrendingUp } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth, Metrics, Trade } from "../lib/types";

const candidates = [
  {
    name: "DOGE Pullback 4H",
    symbol: "DOGEUSDT",
    status: "ACTIVE PAPER",
    expectedWinRate: 49.45,
    expectedProfitFactor: 1.34,
    expectedDrawdown: "medium",
    verdict: "Primary forward-test candidate",
    detail: "EMA 21/89 + RSI pullback + ATR SL/TP. Rulează acum în paper.",
  },
  {
    name: "SOL Pullback 4H",
    symbol: "SOLUSDT",
    status: "WATCHLIST",
    expectedWinRate: 48.8,
    expectedProfitFactor: 1.32,
    expectedDrawdown: "medium",
    verdict: "Good backup candidate",
    detail: "Volatil, potrivit pentru același framework, dar trebuie validat live paper.",
  },
  {
    name: "ETH Trend 1H",
    symbol: "ETHUSDT",
    status: "RESEARCH",
    expectedWinRate: 46.2,
    expectedProfitFactor: 1.27,
    expectedDrawdown: "lower",
    verdict: "Cleaner market structure",
    detail: "Mai stabil decât meme coins, dar are nevoie de filtru mai bun pe range.",
  },
  {
    name: "ADA Donchian",
    symbol: "ADAUSDT",
    status: "LAB",
    expectedWinRate: 41.7,
    expectedProfitFactor: 1.58,
    expectedDrawdown: "higher",
    verdict: "High reward, needs guardrails",
    detail: "Poate avea PF bun, dar trebuie protejat cu cooldown și max loss.",
  },
];

export function StrategyOptimizerCenter({ metrics, trades }: { metrics: Metrics; trades: Trade[] }) {
  const [deep, setDeep] = useState<DeepHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = () => void fetchDeepHealth()
      .then((next) => {
        if (!mounted) return;
        setDeep(next);
        setError("");
      })
      .catch(() => {
        if (mounted) setError("Deep health unavailable");
      });
    load();
    const timer = setInterval(load, 20_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const closed = useMemo(() => trades.filter((trade) => trade.status === "CLOSED"), [trades]);
  const recommendation = deep?.pullbackControl;
  const liveWinRate = recommendation?.winRate ?? metrics.winRate;
  const liveProfitFactor = recommendation?.profitFactor ?? metrics.profitFactor;
  const sampleProgress = recommendation?.forwardReport.sampleProgress ?? Math.min(100, closed.length * 5);
  const realityLevel = recommendation?.forwardReport.level ?? "WAITING";
  const realityMatch = recommendation?.forwardReport.realityMatch ?? 0;

  return (
    <section className="optimizer-center glass-card">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="hero-eyebrow">
            <FlaskConical size={14} />
            Strategy optimizer center
          </div>
          <h3 className="mt-3 text-3xl font-black tracking-tight text-white">Bot-ul alege cu cap, nu cu noroc.</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Centrul compară strategia activă cu candidații de research și arată dacă paper trading-ul confirmă backtest-ul.
          </p>
        </div>
        <div className="optimizer-score-card">
          <div className="label">Reality match</div>
          <div className="mt-2 text-4xl font-black text-white">{realityMatch}%</div>
          <div className="mt-2">
            <span className={`pill ${realityLevel === "MATCHING" ? "pill-success" : realityLevel === "DIVERGING" ? "pill-danger" : ""}`}>{realityLevel}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="optimizer-recommendation">
          <div className="flex items-center gap-3">
            <div className="metric-icon tone-cyan"><BrainCircuit size={18} /></div>
            <div>
              <div className="label">Recommended active module</div>
              <div className="mt-1 text-2xl font-black text-white">{recommendation?.strategyId ?? "DOGE Pullback"}</div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <OptimizerMetric icon={Gauge} label="Edge score" value={`${recommendation?.edgeScore ?? 0}/100`} />
            <OptimizerMetric icon={TrendingUp} label="Live win rate" value={`${liveWinRate?.toFixed(1) ?? "0.0"}%`} />
            <OptimizerMetric icon={Radar} label="Profit factor" value={liveProfitFactor == null ? "learning" : liveProfitFactor.toFixed(2)} />
            <OptimizerMetric icon={ShieldAlert} label="Health" value={recommendation?.healthLevel ?? "LEARNING"} />
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-400">Forward-test sample</span>
              <span className="font-mono font-bold text-white">{sampleProgress}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.max(4, Math.min(100, sampleProgress))}%` }} />
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-amber-300">{error}</p>}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {candidates.map((candidate) => (
            <div className="strategy-candidate-card" key={candidate.name}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="label">{candidate.symbol}</div>
                  <div className="mt-1 text-lg font-black text-white">{candidate.name}</div>
                </div>
                <span className={`pill ${candidate.status.includes("ACTIVE") ? "pill-success" : ""}`}>{candidate.status}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">{candidate.detail}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Mini label="WR" value={`${candidate.expectedWinRate.toFixed(1)}%`} />
                <Mini label="PF" value={candidate.expectedProfitFactor.toFixed(2)} />
                <Mini label="DD" value={candidate.expectedDrawdown} />
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm font-bold text-cyan">
                <CheckCircle2 size={15} />
                {candidate.verdict}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OptimizerMetric({ icon: Icon, label, value }: { icon: typeof BrainCircuit; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-2 text-slate-500"><Icon size={15} /><span className="label">{label}</span></div>
      <div className="mt-2 truncate font-mono text-lg font-black text-white">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-black text-white">{value}</div>
    </div>
  );
}
