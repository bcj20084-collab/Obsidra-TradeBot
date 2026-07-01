import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CandlestickChart,
  Cpu,
  FlaskConical,
  Gauge,
  Layers3,
  Lock,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Workflow,
} from "lucide-react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LogoMark } from "./components/LogoMark";
import { hasSession, login, trpc } from "./lib/api";
import type { Metrics, SignalFeedItem, Trade } from "./lib/types";

const Overview = lazy(() => import("./pages/Overview").then((module) => ({ default: module.Overview })));
const Trades = lazy(() => import("./pages/Trades").then((module) => ({ default: module.Trades })));
const AiBrain = lazy(() => import("./pages/AiBrain").then((module) => ({ default: module.AiBrain })));
const Strategy = lazy(() => import("./pages/Strategy").then((module) => ({ default: module.Strategy })));
const Strategies = lazy(() => import("./pages/Strategies").then((module) => ({ default: module.Strategies })));
const Backtest = lazy(() => import("./pages/Backtest").then((module) => ({ default: module.Backtest })));
const Symbols = lazy(() => import("./pages/Symbols").then((module) => ({ default: module.Symbols })));
const Settings = lazy(() => import("./pages/Settings").then((module) => ({ default: module.Settings })));

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

const previewMetrics: Metrics = {
  ...emptyMetrics,
  totalPnlUsdt: 184.72,
  totalPnlPct: 1.84,
  winRate: 58.4,
  profitFactor: 1.76,
  sharpeRatio: 1.42,
  maxDrawdown: 3.2,
  currentDrawdown: 0.7,
  tradesLast24h: 6,
  totalTrades: 48,
  totalFeesPaidUsdt: 4.18,
  signalsGenerated24h: 23,
  signalsRejected24h: 11,
  totalExposureUsdt: 146.5,
  openPositionsCount: 2,
  mlAccuracy: 63.8,
  botStatus: "RUNNING",
  marketRegime: "PULLBACK WATCH",
  equityCurve: Array.from({ length: 14 }, (_, index) => ({
    date: new Date(Date.now() - (13 - index) * 86_400_000).toISOString().slice(0, 10),
    equity: 10_000 + index * 18 + Math.sin(index / 1.7) * 52,
  })),
  adaptiveConfig: { edgeScore: 72, risk: 0.45, cooldown: 20 },
  safetySupervisor: {
    level: "OK",
    score: 91,
    summary: "Paper execution protected. Risk gate is active and exposure is controlled.",
    updatedAt: new Date().toISOString(),
    checks: [
      { name: "Execution mode", status: "PASS", detail: "Paper trading only" },
      { name: "Daily loss", status: "PASS", detail: "Below guardrail" },
      { name: "Open exposure", status: "PASS", detail: "2 positions monitored" },
    ],
  },
};

const previewTrades: Trade[] = [
  {
    id: "preview-1",
    createdAt: new Date().toISOString(),
    symbol: "DOGEUSDT",
    exchange: "BINANCE",
    strategyId: "doge-4h-pullback",
    direction: "LONG",
    entryPrice: 0.1234,
    exitPrice: null,
    stopLoss: 0.1198,
    takeProfit: 0.132,
    pnlUsdt: 12.45,
    feeUsdt: 0.18,
    slippage: 0.01,
    signalScore: 78,
    holdTimeSeconds: null,
    status: "OPEN",
    executionMode: "PAPER",
    pnlPct: 2.14,
    openedAt: new Date().toISOString(),
    marketRegime: "bullish pullback",
  },
  {
    id: "preview-2",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    symbol: "BTCUSDT",
    exchange: "BINANCE",
    strategyId: "trend-btcusdt",
    direction: "LONG",
    entryPrice: 61_240,
    exitPrice: 61_940,
    stopLoss: 60_420,
    takeProfit: 62_200,
    pnlUsdt: 27.9,
    feeUsdt: 0.42,
    slippage: 0.02,
    signalScore: 71,
    holdTimeSeconds: 5_400,
    status: "CLOSED",
    executionMode: "PAPER",
    pnlPct: 1.14,
    closeReason: "take_profit",
    openedAt: new Date(Date.now() - 5_400_000).toISOString(),
    closedAt: new Date(Date.now() - 3_600_000).toISOString(),
    marketRegime: "trend",
  },
];

const previewSignals: SignalFeedItem[] = [
  {
    id: "signal-preview-1",
    type: "BUY",
    createdAt: new Date().toISOString(),
    symbol: "DOGEUSDT",
    exchange: "BINANCE",
    direction: "LONG",
    status: "READY",
    score: 78,
    confidence: 64,
    reason: "4H pullback confirmed, risk gate passed",
    price: 0.1234,
    stopLoss: 0.1198,
    takeProfit: 0.132,
    regime: "bullish pullback",
    details: { htfTrend: "bullish", atrPct: 2.1 },
  },
  {
    id: "signal-preview-2",
    type: "SKIP",
    createdAt: new Date(Date.now() - 900_000).toISOString(),
    symbol: "ETHUSDT",
    exchange: "BINANCE",
    direction: "LONG",
    status: "REJECTED",
    score: 49,
    confidence: 51,
    reason: "Risk reward below threshold",
    price: 3420,
    stopLoss: 3368,
    takeProfit: 3488,
    regime: "chop",
    details: { reject: "rr_too_low" },
  },
];

const navGroups = [
  {
    title: "Command",
    items: [
      { to: "/", label: "Mission Control", description: "Live cockpit", icon: Gauge },
      { to: "/trades", label: "Trade Tape", description: "Entries, exits, replay", icon: CandlestickChart },
      { to: "/settings", label: "Control Room", description: "Safety switches", icon: SettingsIcon },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { to: "/ai-brain", label: "AI Brain", description: "Learning, health, no-trade reasons", icon: BrainCircuit },
      { to: "/strategy", label: "Signal Lab", description: "Signal diagnostics", icon: Activity },
      { to: "/strategies", label: "Strategy OS", description: "Active modules", icon: Workflow },
      { to: "/backtest", label: "Optimizer", description: "Backtest lab", icon: FlaskConical },
      { to: "/symbols", label: "Markets", description: "Universe scanner", icon: Layers3 },
    ],
  },
] as const;

const routeMeta = {
  "/": { label: "Mission Control", eyebrow: "Premium command surface", detail: "Live paper execution, DOGE pullback intelligence and risk radar." },
  "/trades": { label: "Trade Tape", eyebrow: "Execution archive", detail: "Review fills, PnL, replay and lifecycle events." },
  "/ai-brain": { label: "AI Brain", eyebrow: "Learning core", detail: "Loss brain, health score, no-trade reasons and adaptive intelligence." },
  "/strategy": { label: "Signal Lab", eyebrow: "Signal intelligence", detail: "Inspect signal quality, rejects and market diagnostics." },
  "/strategies": { label: "Strategy OS", eyebrow: "Automation layer", detail: "Active strategies, configuration and operating posture." },
  "/backtest": { label: "Optimizer", eyebrow: "Research lab", detail: "Backtest strategy ideas before paper deployment." },
  "/symbols": { label: "Markets", eyebrow: "Market universe", detail: "Track available symbols and market readiness." },
  "/settings": { label: "Control Room", eyebrow: "Operator controls", detail: "Safety controls, sessions and runtime operations." },
} as const;

export default function App() {
  const location = useLocation();
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [signals, setSignals] = useState<SignalFeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (previewMode) {
      setMetrics(previewMetrics);
      setTrades(previewTrades);
      setSignals(previewSignals);
      setConnectionError("");
      setLastRefreshAt(new Date());
      return;
    }
    setRefreshing(true);
    try {
      const [nextMetrics, nextTrades, nextSignals] = await Promise.all([
        trpc.query("metrics.live") as Promise<Metrics>,
        trpc.query("trades.list", { limit: 100, offset: 0 }) as Promise<Trade[]>,
        trpc.query("signals.feed", { limit: 40 }) as Promise<SignalFeedItem[]>,
      ]);
      setMetrics(nextMetrics);
      setTrades(nextTrades);
      setSignals(nextSignals);
      setConnectionError("");
      setLastRefreshAt(new Date());
    } catch {
      setConnectionError("API connection interrupted. Showing last known state.");
    } finally {
      setRefreshing(false);
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) {
      setAuthenticated(true);
      setMetrics(previewMetrics);
      setTrades(previewTrades);
      setSignals(previewSignals);
      setLastRefreshAt(new Date());
      return;
    }
    void hasSession().then(setAuthenticated).catch(() => setAuthenticated(false));
  }, [previewMode]);
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
  const page = routeMeta[(location.pathname as keyof typeof routeMeta)] ?? routeMeta["/"];
  const openTradeCount = trades.filter((trade) => ["OPEN", "FILLED", "CLOSING"].includes(trade.status)).length;
  const navBadge = (to: string): string | null => {
    if (to === "/") return metrics.botStatus === "RUNNING" ? "LIVE" : metrics.botStatus;
    if (to === "/trades") return openTradeCount ? String(openTradeCount) : String(metrics.tradesLast24h);
    if (to === "/ai-brain") return metrics.safetySupervisor?.level ?? "AI";
    if (to === "/strategy") return signals.length ? String(signals.length) : null;
    if (to === "/strategies") return "OS";
    if (to === "/backtest") return "LAB";
    if (to === "/settings") return connectionError ? "!" : null;
    return null;
  };

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
    <div className="app-shell min-h-screen xl:grid xl:h-screen xl:grid-cols-[328px_minmax(0,1fr)] xl:overflow-hidden">
      <aside className="premium-sidebar z-20 flex min-h-screen flex-col border-b border-white/10 p-4 backdrop-blur-xl xl:sticky xl:top-0 xl:h-screen xl:border-b-0 xl:border-r xl:p-5">
        <div className="sidebar-head flex shrink-0 items-center justify-between gap-3 xl:block">
          <div className="brand-card flex items-center gap-3">
            <LogoMark />
            <div>
              <div className="text-xl font-black tracking-[0.28em] text-white">OBSIDRA</div>
              <div className="text-xs uppercase tracking-[0.22em] text-cyan">TradeBot OS</div>
            </div>
          </div>
          <div className={`status-dot xl:mt-7 ${runtime.healthy ? "is-live" : "is-warn"}`}>
            <span />
            {runtime.status}
          </div>
        </div>

        <div className="sidebar-scroll mt-5 flex min-h-0 flex-1 flex-col overflow-hidden xl:mt-6">
          <nav className="flex shrink-0 gap-2 overflow-x-auto pb-2 xl:flex-col xl:gap-4 xl:overflow-visible xl:pb-0">
            {navGroups.map((group) => (
              <div className="sidebar-nav-group" key={group.title}>
                <div className="sidebar-section-title hidden xl:block">{group.title}</div>
                <div className="mt-2 flex gap-2 xl:flex-col">
                  {group.items.map(({ to, label, description, icon: Icon }) => (
                    <NavLink
                      className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
                      end={to === "/"}
                      key={to}
                      to={to}
                    >
                      <Icon size={18} />
                      <span className="min-w-0">
                        <span className="block truncate">{label}</span>
                        <span className="nav-item-desc hidden xl:block">{description}</span>
                      </span>
                      {navBadge(to) ? <span className="nav-badge">{navBadge(to)}</span> : null}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="sidebar-panel-stack mt-5 hidden min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 xl:block">
            <div className="sidebar-section-title">System stack</div>
            <div className="sidebar-command-panel">
              <div className="flex items-center gap-3">
                <div className="sidebar-command-icon">
                  <Cpu size={18} />
                </div>
                <div>
                  <div className="text-sm font-black text-white">Autopilot Core</div>
                  <div className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan/70">paper intelligence</div>
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                <FlowStep index="01" title="Scan" text="Market structure + volume" />
                <FlowStep index="02" title="Approve" text="Risk, exposure, guardrails" />
                <FlowStep index="03" title="Replay" text="Trade lifecycle + journal" />
              </div>
            </div>
            <div className="sidebar-card">
              <div className="label">Runtime mode</div>
              <div className="mt-3 text-lg font-bold text-white">{runtime.mode}</div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Orders are simulated while the engine reads live/demo Binance market data.
              </p>
            </div>
            <div className="sidebar-card">
              <div className="label">Safety rails</div>
              <div className="mt-4 space-y-2.5 text-sm">
                <CheckRow text="Paper execution enabled" />
                <CheckRow text="Risk gate active" />
                <CheckRow text="DOGE 4H pullback guarded" />
                <CheckRow text="Forward-test reality match" />
              </div>
            </div>
            <div className="sidebar-card">
              <div className="label">Session telemetry</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <SideMetric label="Trades" value={String(metrics.totalTrades)} />
                <SideMetric label="24h" value={String(metrics.tradesLast24h)} />
                <SideMetric label="PF" value={metrics.profitFactor.toFixed(2)} />
                <SideMetric label="WR" value={`${metrics.winRate.toFixed(0)}%`} />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="dashboard-main min-w-0 overflow-x-hidden p-4 sm:p-6 lg:p-8 xl:h-screen xl:overflow-y-auto">
        <div className="premium-topbar mb-6 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <div className="label">{page.eyebrow}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">{page.label}</h1>
              <span className={`pill ${connectionError ? "pill-danger" : "pill-success"}`}>
                {connectionError ? "Degraded" : "Connected"}
              </span>
              <span className="pill">Paper mode</span>
              <span className="pill">Dark terminal</span>
            </div>
            <p className={`mt-2 text-sm ${connectionError ? "text-rose-300" : "text-slate-400"}`}>
              {connectionError || `${page.detail} Last sync ${lastRefreshAt ? lastRefreshAt.toLocaleTimeString() : "pending"} | Binance demo market feed`}
            </p>
          </div>
          <div className="topbar-actions">
            <div className="command-chip">
              <span className="command-chip-dot" />
              DOGE Pullback OS
            </div>
            <div className="command-chip command-chip-muted">
              <TimerReset size={14} />
              10s sync
            </div>
            <button className="button glow-button flex items-center justify-center gap-2" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} />
              Refresh
            </button>
          </div>
        </div>

        <Suspense fallback={<div className="empty-state">Loading premium module...</div>}>
          <Routes>
            <Route path="/" element={<Overview metrics={metrics} trades={trades} signals={signals} />} />
            <Route path="/trades" element={<Trades trades={trades} />} />
            <Route path="/ai-brain" element={<AiBrain metrics={metrics} trades={trades} signals={signals} />} />
            <Route path="/strategy" element={<Strategy metrics={metrics} />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/symbols" element={<Symbols />} />
            <Route path="/settings" element={<Settings metrics={metrics} refresh={() => void refresh()} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function FlowStep({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <div className="sidebar-flow-step">
      <div className="sidebar-flow-index">{index}</div>
      <div>
        <div className="text-sm font-black text-white">{title}</div>
        <div className="text-xs text-slate-500">{text}</div>
      </div>
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

function SideMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-slate-600">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-black text-white">{value}</div>
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
      <form className="login-panel relative w-full max-w-md p-7" onSubmit={submit}>
        <div className="mb-6 flex items-center gap-3">
          <LogoMark compact />
          <div>
            <div className="label">Secure dashboard</div>
            <h1 className="text-3xl font-black">Enter Obsidra</h1>
          </div>
        </div>
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
          <Lock size={14} className="text-cyan" />
          Protected operator console
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
