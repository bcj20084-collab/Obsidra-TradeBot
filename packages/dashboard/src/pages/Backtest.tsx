import { useEffect, useState } from "react";
import { trpc } from "../lib/api";

interface Run {
  id: string;
  symbol: string;
  startDate: string;
  endDate: string;
  metrics: Record<string, number | string | null>;
}

export function Backtest() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({ symbol: "BTCUSDT", startDate: "2025-01-01", endDate: "2025-12-31", initialEquity: 10_000, commission: 0.00055, slippage: 0.0002 });
  const load = () => void (trpc.query("backtest.list") as Promise<Run[]>).then(setRuns);
  useEffect(load, []);
  const run = async () => {
    setRunning(true);
    await trpc.mutation("backtest.run", form);
    setRunning(false);
    load();
  };
  return (
    <div className="space-y-5">
      <div><div className="label">Historical validation</div><h1 className="mt-2 text-3xl font-bold">Backtest</h1></div>
      <div className="card grid gap-4 md:grid-cols-3">
        {Object.entries(form).map(([key, value]) => <label key={key}><span className="mb-2 block text-sm text-slate-400">{key}</span><input className="input" type={typeof value === "number" ? "number" : key.includes("Date") ? "date" : "text"} step="any" value={value} onChange={(event) => setForm({ ...form, [key]: typeof value === "number" ? Number(event.target.value) : event.target.value })} /></label>)}
        <button className="button border-cyan/40 text-cyan" disabled={running} onClick={() => void run()}>{running ? "Running…" : "Run backtest"}</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{runs.map((run) => <div className="card" key={run.id}><div className="label">{run.symbol} · {run.startDate} → {run.endDate}</div><div className="mt-4 grid grid-cols-2 gap-3">{Object.entries(run.metrics).slice(0, 6).map(([key, value]) => <div key={key}><div className="text-xs text-slate-500">{key}</div><div className="font-mono text-lg">{String(value ?? "—")}</div></div>)}</div></div>)}</div>
    </div>
  );
}
