import { useCallback, useEffect, useState } from "react";
import { Activity, CandlestickChart, FlaskConical, Gauge, Layers3, RefreshCw, Settings as SettingsIcon, Workflow } from "lucide-react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { hasSession, login, trpc } from "./lib/api";
import type { Metrics, Trade } from "./lib/types";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { Strategy } from "./pages/Strategy";
import { Trades } from "./pages/Trades";
import { Backtest } from "./pages/Backtest";
import { Symbols } from "./pages/Symbols";
import { Strategies } from "./pages/Strategies";

const emptyMetrics: Metrics = {
  totalPnlUsdt: 0, totalPnlPct: 0, winRate: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0,
  currentDrawdown: 0, tradesLast24h: 0, totalTrades: 0, totalFeesPaidUsdt: 0, botStatus: "STOPPED",
  marketRegime: "NORMAL", equityCurve: [], adaptiveConfig: {},
};

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextMetrics, nextTrades] = await Promise.all([
        trpc.query("metrics.live") as Promise<Metrics>,
        trpc.query("trades.list", { limit: 100, offset: 0 }) as Promise<Trade[]>,
      ]);
      setMetrics(nextMetrics);
      setTrades(nextTrades);
      setConnectionError("");
    } catch {
      setConnectionError("Conexiunea cu API-ul este întreruptă. Datele afișate pot fi vechi.");
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void hasSession().then(setAuthenticated); }, []);
  useEffect(() => {
    if (!authenticated) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [authenticated, refresh]);
  if (authenticated === null) return <div className="grid min-h-screen place-items-center text-slate-400">Loading Obsidra…</div>;
  if (!authenticated) return <Login onSuccess={() => setAuthenticated(true)} />;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-border bg-black/20 p-4 lg:min-h-screen lg:border-b-0 lg:border-r lg:p-6">
        <div className="flex items-center gap-3 text-xl font-bold"><div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan/10 text-cyan">O</div> OBSIDRA</div>
        <nav className="mt-5 flex gap-2 overflow-x-auto lg:mt-10 lg:flex-col">
          {[
            ["/", "Overview", Gauge],
            ["/trades", "Trades", CandlestickChart],
            ["/strategy", "Strategy", Activity],
            ["/strategies", "Strategies", Workflow],
            ["/backtest", "Backtest", FlaskConical],
            ["/symbols", "Symbols", Layers3],
            ["/settings", "Control", SettingsIcon],
          ].map(([to, label, Icon]) => (
            <NavLink className={({ isActive }) => `flex min-w-fit items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? "bg-cyan/10 text-cyan" : "text-slate-400 hover:bg-white/5 hover:text-white"}`} end={to === "/"} key={String(to)} to={String(to)}>
              <Icon size={17} />{String(label)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 hidden rounded-xl border border-border p-4 text-xs text-slate-500 lg:block"><span className={metrics.botStatus === "RUNNING" ? "text-emerald-400" : "text-amber-400"}>●</span> {metrics.botStatus}<br /><span className="mt-2 block">Paper-first execution</span></div>
      </aside>
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex min-h-10 items-center justify-between gap-4">
          <div aria-live="polite" className={`text-sm ${connectionError ? "text-rose-400" : "text-emerald-400"}`}>
            {connectionError || "● Sistem conectat"}
          </div>
          <button className="button flex items-center gap-2" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} size={15} />
            Actualizează
          </button>
        </div>
        <Routes>
          <Route path="/" element={<Overview metrics={metrics} trades={trades} />} />
          <Route path="/trades" element={<Trades trades={trades} />} />
          <Route path="/strategy" element={<Strategy metrics={metrics} />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/symbols" element={<Symbols />} />
          <Route path="/settings" element={<Settings metrics={metrics} refresh={() => void refresh()} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await login(password);
      onSuccess();
    } catch {
      setError("Credential rejected.");
    }
  };
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form className="card w-full max-w-sm" onSubmit={submit}>
        <div className="label">Secure dashboard</div><h1 className="mt-3 text-3xl font-bold">Enter Obsidra</h1>
        <p className="mt-2 text-sm text-slate-400">Session authentication is stored only in a secure httpOnly cookie.</p>
        <input className="input mt-6" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Dashboard password" autoFocus />
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <button className="button mt-4 w-full border-cyan/30 bg-cyan/10 text-cyan">Sign in</button>
      </form>
    </div>
  );
}
