import type { Metrics } from "../lib/types";

export function Strategy({ metrics }: { metrics: Metrics }) {
  return (
    <div className="space-y-5">
      <div><div className="label">Decision pipeline</div><h1 className="mt-2 text-3xl font-bold">Strategy</h1></div>
      <div className="grid gap-4 md:grid-cols-3">
        {["4H Trend Filter", "15M Entry Signal", "ML Adjustment"].map((title, index) => (
          <div className="card" key={title}><div className="label">Stage {index + 1}</div><h2 className="mt-3 text-xl font-semibold">{title}</h2><div className="mt-6 h-2 rounded-full bg-black/40"><div className="h-full rounded-full bg-cyan" style={{ width: `${62 + index * 8}%` }} /></div></div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <div className="label">Market regime</div>
          <div className="mt-4 inline-flex rounded-full border border-cyan/30 bg-cyan/10 px-4 py-2 font-semibold text-cyan">{metrics.marketRegime}</div>
          <p className="mt-4 text-sm leading-6 text-slate-400">Breakout signals are blocked in ranging conditions. Drawdown mode halves sizing and raises the score threshold.</p>
        </div>
        <div className="card">
          <div className="label">Adaptive parameters</div>
          <div className="mt-4 space-y-3">{Object.entries(metrics.adaptiveConfig).map(([key, value]) => <div className="flex justify-between border-b border-border pb-2" key={key}><span className="text-slate-400">{key}</span><strong>{value}</strong></div>)}</div>
        </div>
      </div>
      <div className="card"><div className="label">Circuit breaker</div><div className="mt-3 text-lg font-semibold text-emerald-400">● Armed and healthy</div></div>
    </div>
  );
}
