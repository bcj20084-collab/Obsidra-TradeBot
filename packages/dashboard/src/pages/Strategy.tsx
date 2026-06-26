import { useEffect, useState } from "react";
import type { Metrics } from "../lib/types";
import { trpc } from "../lib/api";

interface MlTrainingStatus {
  latestWeights: Array<{
    id: string;
    symbol: string;
    tradeCount: number;
    cvAccuracy: number | null;
    cvLogLoss: number | null;
    wfEfficiency: number | null;
    trainedAt: string;
  }>;
  history: Array<{
    id: string;
    symbol: string;
    tradeCount: number;
    cvAccuracy: number;
    cvLogLoss: number;
    wfEfficiency: number;
    savedWeights: boolean;
    rejectReason: string | null;
    featureImportance: unknown;
    trainedAt: string;
  }>;
}

export function Strategy({ metrics }: { metrics: Metrics }) {
  const [training, setTraining] = useState<MlTrainingStatus | null>(null);

  useEffect(() => {
    let active = true;
    void trpc.query("config.mlTraining").then((value) => {
      if (active) setTraining(value as MlTrainingStatus);
    }).catch(() => {
      if (active) setTraining(null);
    });
    return () => { active = false; };
  }, []);

  const latestModel = training?.latestWeights[0];
  const latestRun = training?.history[0];

  return (
    <div className="space-y-5">
      <div>
        <div className="label">Decision pipeline</div>
        <h1 className="mt-2 text-3xl font-bold">Strategy</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {["4H Trend Filter", "15M Entry Signal", "ML Adjustment"].map((title, index) => (
          <div className="card" key={title}>
            <div className="label">Stage {index + 1}</div>
            <h2 className="mt-3 text-xl font-semibold">{title}</h2>
            <div className="mt-6 h-2 rounded-full bg-black/40">
              <div className="h-full rounded-full bg-cyan" style={{ width: `${62 + index * 8}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <div className="label">Market regime</div>
          <div className="mt-4 inline-flex rounded-full border border-cyan/30 bg-cyan/10 px-4 py-2 font-semibold text-cyan">{metrics.marketRegime}</div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Breakout signals are blocked in ranging conditions. Drawdown mode halves sizing and raises the score threshold.
          </p>
        </div>
        <div className="card">
          <div className="label">Adaptive parameters</div>
          <div className="mt-4 space-y-3">
            {Object.entries(metrics.adaptiveConfig).map(([key, value]) => (
              <div className="flex justify-between border-b border-border pb-2" key={key}>
                <span className="text-slate-400">{key}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label">AI Training Center</div>
            <h2 className="mt-2 text-2xl font-black">Auto-training status</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Obsidra retrains on closed paper trades, validates the model, and loads new weights only when validation improves.
            </p>
          </div>
          <div className={`pill ${latestModel ? "pill-success" : ""}`}>
            {latestModel ? "Model active" : "Waiting for 50 closed trades"}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <TrainingStat label="ML Accuracy" value={formatPct(latestModel?.cvAccuracy ?? metrics.mlAccuracy ?? null)} />
          <TrainingStat label="Training trades" value={String(latestModel?.tradeCount ?? latestRun?.tradeCount ?? 0)} />
          <TrainingStat label="WF Efficiency" value={formatNumber(latestModel?.wfEfficiency ?? latestRun?.wfEfficiency ?? null)} />
          <TrainingStat label="Last run" value={latestRun ? new Date(latestRun.trainedAt).toLocaleString() : "No run yet"} />
        </div>

        <div className="mt-5 space-y-3">
          {(training?.history ?? []).slice(0, 5).map((run) => (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-black text-white">{run.symbol}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {run.savedWeights ? "Saved new model weights" : run.rejectReason ?? "Validated but not saved"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`pill ${run.savedWeights ? "pill-success" : ""}`}>{run.savedWeights ? "Saved" : "Rejected"}</span>
                  <span className="pill">{formatPct(run.cvAccuracy)} accuracy</span>
                  <span className="pill">{run.tradeCount} trades</span>
                </div>
              </div>
            </div>
          ))}
          {!training?.history.length && (
            <div className="empty-state">
              <div className="text-lg font-bold text-white">No training run yet</div>
              <p className="mt-2 text-sm text-slate-400">The bot will start auto-training after enough closed paper trades exist.</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="label">Circuit breaker</div>
        <div className="mt-3 text-lg font-semibold text-emerald-400">Armed and healthy</div>
      </div>
    </div>
  );
}

function TrainingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="label">{label}</div>
      <div className="mt-2 text-xl font-black text-white">{value}</div>
    </div>
  );
}

function formatPct(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}
