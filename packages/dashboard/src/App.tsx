import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CandlestickChart,
  FlaskConical,
  Gauge,
  Layers3,
  Lock,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
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
  totalPnlUsdt: 0,
  totalPnlPct: 0,
  winRate: 0,
  profitFactor: 0,
  sharpeRatio: 0,
  maxDrawdown: 0,
  currentDrawdown: 0,
  tradesLast24h: 0,
  totalTrades: 0,
  totalFeesPaidUsdt: 0,
  botStatus: "STOPPED",
  marketRegime: "NORMAL",
  equityCurve: [],
  adaptiveConfig: {},
};

const navItems = [
  ["/", "Cockpit", Gauge],
  ["/trades", "Trades", CandlestickChart],
  ["/strategy", "Signal Lab", Activity],
  ["/strategies", "Strategies", Workflow],
  ["/backtest", "Backtest", FlaskConical],
  ["/symbols", "Symbols", Layers3],
  ["/settings", "Control", SettingsIcon],
] as const;

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

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
      setLastRefreshAt(new Date());
    } catch {
      setConnectionError("API connection interrupted. Showing last known state.");
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

  const runtime = useMemo(() => {
    const status = metrics.botStatus;
    const healthy = status === "RUNNING";
    const mode = "Paper / Binance market data";
    return { status, healthy, mode };
  }, [metrics.botStatus]);

  if (authenticated === null) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-400">
        <div className="glass-card flex items-center gap-3 px-5 py-4">
          <RefreshCw className="animate-spin text-cyan" size={18} />
          Loading Obsidra cockpit...
        </div>
      </div>
    );
  }

  if (!authenticated) return <Login onSuccess={() => setAuthenticated(true)} />;

  return (
    <div className="min-h-screen xl:grid xl:grid-cols-[280px_1fr]">
      <aside className="sticky top-0 z-20 border-b border-white/10 bg-obsidian/80 p-4 backdrop-blur-xl xl:h-screen xl:border-b-0 xl:border-r xl:p-6">
        <div className="flex items-center justify-between gap-3 xl:block">
          <div className="flex items-center gap-3">
            <div className="logo-orb">O</div>
            <div>
              <div className="text-lg font-black tracking-[0.28em] text-white">OBSIDRA</div>
              <div className="text-xs uppercase tracking-[0.22em] text-cyan">TradeBot OS</div>
            </div>
          </div>
          <div className={`status-dot xl:mt-7 ${runtime.healthy ? "is-live" : "is-warn"}`}>
            <span />
            {runtime.status}
          </div>
        </div>

        <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 xl:mt-8 xl:flex-col xl:overflow-visible xl:pb-0">
          {navItems.map(([to, label, Icon]) => (
            <NavLink
              className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
              end={to === "/"}
              key={to}
              to={to}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-7 hidden space-y-4 xl:block">
          <div className="glass-card">
            <div className="label">Runtime mode</div>
            <div className="mt-3 text-lg font-bold text-white">{runtime.mode}</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Orders are simulated while the engine reads live/demo Binance market data.
            </p>
          </div>
          <div className="glass-card">
            <div className="label">Safety rails</div>
            <div className="mt-4 space-y-3 text-sm">
              <CheckRow text="Paper execution enabled" />
              <CheckRow text="Risk gate active" />
              <CheckRow text="Telegram connected" />
            </div>
          </div>
        </div>
      </aside>

      <main className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-glow lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="label">Command surface</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight">Trading cockpit</h1>
              <span className={`pill ${connectionError ? "pill-danger" : "pill-success"}`}>
                {connectionError ? "Degraded" : "Connected"}
              </span>
              <span className="pill">Paper mode</span>
            </div>
            <p className={`mt-2 text-sm ${connectionError ? "text-rose-300" : "text-slate-400"}`}>
              {connectionError || `Last sync ${lastRefreshAt ? lastRefreshAt.toLocaleTimeString() : "pending"} · Binance demo market feed`}
            </p>
          </div>
          <button className="button glow-button flex items-center justify-center gap-2" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} />
            Refresh
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

function CheckRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-300">
      <ShieldCheck className="text-emerald-400" size={16} />
      {text}
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
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(80,227,194,.16),transparent_34rem)]" />
      <form className="glass-card relative w-full max-w-md p-7" onSubmit={submit}>
        <div className="mb-6 flex items-center gap-3">
          <div className="logo-orb"><Lock size={20} /></div>
          <div>
            <div className="label">Secure dashboard</div>
            <h1 className="text-3xl font-black">Enter Obsidra</h1>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-400">
          Operator access is protected by an httpOnly session cookie. No API keys are shown here.
        </p>
        <input
          className="input mt-6"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Dashboard password"
          autoFocus
        />
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <button className="button glow-button mt-5 flex w-full items-center justify-center gap-2 border-cyan/30 bg-cyan/10 text-cyan">
          <Sparkles size={16} />
          Sign in
        </button>
      </form>
    </div>
  );
}
