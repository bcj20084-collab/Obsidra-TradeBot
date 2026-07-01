import { useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Bot, BrainCircuit, CandlestickChart, CheckCircle2, Radar, Shield, Sparkles, Target, Zap } from "lucide-react";
import type { Metrics, ReplayCandle, SignalFeedItem, Trade, TradeDetail } from "../lib/types";
import { DeepHealthPanel } from "../components/DeepHealthPanel";
import { EquityCurve } from "../components/EquityCurve";
import { MetricsCards } from "../components/MetricsCards";
import { PremiumIntelligence } from "../components/PremiumIntelligence";
import { SafetySupervisor } from "../components/SafetySupervisor";
import { SignalDiagnostics } from "../components/SignalDiagnostics";
import { SignalFeed } from "../components/SignalFeed";
import { StrategyOptimizerCenter } from "../components/StrategyOptimizerCenter";
import { SystemDeployCenter } from "../components/SystemDeployCenter";
import { TopBotParity } from "../components/TopBotParity";
import { TradeReplayPanel } from "../components/TradeReplayPanel";
import { TradeTable } from "../components/TradeTable";
import { trpc } from "../lib/api";

export function Overview({ metrics, trades, signals }: { metrics: Metrics; trades: Trade[]; signals: SignalFeedItem[] }) {
  const [selectedTrade, setSelectedTrade] = useState<TradeDetail | null>(null);
  const [replayCandles, setReplayCandles] = useState<ReplayCandle[]>([]);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const equity = 10_000 + metrics.totalPnlUsdt;
  const openTrades = trades.filter((trade) => ["OPEN", "FILLED", "CLOSING"].includes(trade.status));
  const openPositions = metrics.openPositionsCount ?? openTrades.length;
  const closedTrades = trades.filter((trade) => trade.status === "CLOSED");
  const latestTrade = trades[0];
  const pnlPositive = metrics.totalPnlUsdt >= 0;

  const openReplay = async (trade: Trade) => {
    setLoadingReplay(true);
    setSelectedTrade({ ...trade, transitions: [], journalEntries: [] });
    setReplayCandles([]);
    try {
      const [detail, candles] = await Promise.all([
        trpc.query("trades.detail", { id: trade.id }) as Promise<TradeDetail | null>,
        trpc.query("trades.candles", { id: trade.id, interval: "15", limit: 220 }) as Promise<ReplayCandle[]>,
      ]);
      if (detail) setSelectedTrade(detail);
      setReplayCandles(candles);
    } finally {
      setLoadingReplay(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="hero-grid">
        <div className="glass-card hero-card">
          <div className="premium-hero-noise" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="hero-eyebrow">
                <Sparkles size={14} />
                Portfolio intelligence
              </div>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white md:text-5xl">
                Premium black cockpit pentru bot-ul tău smart.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
                Obsidra is running protected paper execution, DOGE 4H pullback intelligence, forward-test reality match, and risk checks before any real-money mode is considered.
              </p>
            </div>
            <div className={`hero-pnl ${pnlPositive ? "text-emerald-300" : "text-rose-300"}`}>
              <span>{pnlPositive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</span>
              {metrics.totalPnlUsdt.toFixed(2)} USDT
            </div>
          </div>

          <div className="premium-command-strip mt-8">
            <CommandNode icon={BrainCircuit} label="Brain" value="Auto scan" />
            <CommandNode icon={Shield} label="Safety" value="Risk gated" />
            <CommandNode icon={CandlestickChart} label="Replay" value="Live trade view" />
            <CommandNode icon={CheckCircle2} label="Mode" value="Paper safe" />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <HeroStat label="Equity" value={`$${equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} icon={Target} />
            <HeroStat label="Bot status" value={metrics.botStatus} icon={Bot} tone={metrics.botStatus === "RUNNING" ? "good" : "warn"} />
            <HeroStat label="Regime" value={metrics.marketRegime} icon={Radar} />
            <HeroStat label="Open trades" value={String(openPositions)} icon={Zap} />
          </div>
        </div>

        <div className="glass-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="label">Risk posture</div>
              <h3 className="mt-2 text-2xl font-black">Protected</h3>
            </div>
            <Shield className="text-cyan" size={30} />
          </div>
          <RiskLine label="Current drawdown" value={`${metrics.currentDrawdown.toFixed(2)}%`} limit="8%" percent={Math.min(100, (metrics.currentDrawdown / 8) * 100)} />
          <RiskLine label="Max drawdown" value={`${metrics.maxDrawdown.toFixed(2)}%`} limit="tracked" percent={Math.min(100, (metrics.maxDrawdown / 20) * 100)} />
          <RiskLine label="Win rate" value={`${metrics.winRate.toFixed(1)}%`} limit="target 50%+" percent={Math.min(100, metrics.winRate)} positive />
          <div className="rounded-2xl border border-cyan/15 bg-cyan/5 p-4 text-sm leading-6 text-slate-300">
            Paper mode is active, so execution is simulated while signals and risk logic stay live.
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <ModuleTile label="1. Signal" value="DOGE 4H Pullback" detail="EMA/RSI/ATR edge check" />
        <ModuleTile label="2. Risk" value="Guarded Paper" detail="Portfolio + loss cooldown" />
        <ModuleTile label="3. Execution" value="Strategy Timeout" detail="72 candles / 288h max hold" />
        <ModuleTile label="4. Learning" value="Reality Match" detail="Backtest vs paper behavior" />
      </section>

      <section className="premium-ops-grid">
        <div className="glass-card premium-flow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Automation pipeline</div>
              <h3 className="mt-2 text-2xl font-black">Signal → Risk → Trade → Learn</h3>
            </div>
            <span className="pill pill-success">operator ready</span>
          </div>
          <div className="mt-6 grid gap-3 lg:grid-cols-4">
            <PipelineStep step="01" title="Scan market" text="DOGE 4H candle, EMA trend, RSI pullback, ATR volatility." />
            <PipelineStep step="02" title="Score setup" text="Checklist, edge score, forward-test health and daily cap." />
            <PipelineStep step="03" title="Paper execute" text="Entry, stop, take profit, max hold and journal events." />
            <PipelineStep step="04" title="Improve" text="Reality match compares live paper results with backtest profile." />
          </div>
        </div>

        <div className="glass-card premium-vault-card">
          <div className="label">Premium feel</div>
          <h3 className="mt-2 text-2xl font-black">Dark, clean, boss-level.</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Layout-ul e gândit să vezi imediat ce contează: status, risc, strategie, execuții și ce învață bot-ul.
          </p>
          <div className="mt-5 space-y-3">
            <VaultItem text="Sidebar organizat cap-coadă" />
            <VaultItem text="Trade replay când apeși pe trade" />
            <VaultItem text="Control center pentru strategia activă" />
          </div>
        </div>
      </section>

      <SystemDeployCenter />

      <DeepHealthPanel />

      <StrategyOptimizerCenter metrics={metrics} trades={trades} />

      <PremiumIntelligence metrics={metrics} trades={trades} signals={signals} />

      <MetricsCards metrics={metrics} />

      <SafetySupervisor status={metrics.safetySupervisor} />

      <SignalDiagnostics signals={signals} />

      <section className="grid gap-6 2xl:grid-cols-[1.4fr_.8fr]">
        <div className="glass-card">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Equity telemetry</div>
              <h3 className="mt-2 text-2xl font-black">Performance curve</h3>
            </div>
            <div className="pill">30 day view</div>
          </div>
          <EquityCurve data={metrics.equityCurve} />
        </div>

        <div className="grid gap-6">
          <div className="glass-card">
            <div className="label">Signal engine</div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <MiniStat label="Signals ready 24h" value={String(metrics.signalsGenerated24h ?? 0)} />
              <MiniStat label="Skipped/rejected 24h" value={String(metrics.signalsRejected24h ?? 0)} />
              <MiniStat label="Exposure" value={`${(metrics.totalExposureUsdt ?? 0).toFixed(2)} USDT`} />
              <MiniStat label="Profit factor" value={metrics.profitFactor.toFixed(2)} />
              <MiniStat label="Fees" value={`${metrics.totalFeesPaidUsdt.toFixed(2)} USDT`} />
            </div>
          </div>

          <div className="glass-card">
            <div className="label">Latest event</div>
            {latestTrade ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xl font-black">{latestTrade.symbol}</div>
                    <div className="text-sm text-slate-400">{latestTrade.exchange} · {latestTrade.strategyId}</div>
                  </div>
                  <span className={`pill ${latestTrade.direction === "LONG" ? "pill-success" : "pill-danger"}`}>{latestTrade.direction}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MiniStat label="Entry" value={formatMoney(latestTrade.entryPrice)} />
                  <MiniStat label="PnL" value={formatMoney(latestTrade.pnlUsdt)} />
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-400">No simulated executions yet. Waiting for the next qualified signal.</p>
            )}
          </div>
        </div>
      </section>

      <section className="glass-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">Execution tape</div>
            <h3 className="mt-2 text-2xl font-black">Recent simulated trades</h3>
          </div>
          <div className="pill">{closedTrades.length} closed</div>
        </div>
        <TradeTable trades={trades.slice(0, 8)} compact onSelect={openReplay} />
      </section>

      <SignalFeed items={signals} />

      <TopBotParity />

      <TradeReplayPanel trade={selectedTrade} candles={replayCandles} loading={loadingReplay} onClose={() => setSelectedTrade(null)} />
    </div>
  );
}

function CommandNode({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="command-node">
      <div className="command-node-icon">
        <Icon size={16} />
      </div>
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
        <div className="mt-0.5 text-sm font-black text-white">{value}</div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Activity; tone?: "good" | "warn" }) {
  return (
    <div className="metric-tile">
      <Icon className={tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-300" : "text-cyan"} size={20} />
      <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-black">{value}</div>
    </div>
  );
}

function RiskLine({ label, value, limit, percent, positive = false }: { label: string; value: string; limit: string; percent: number; positive?: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-white">{value} <span className="text-slate-600">/ {limit}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${positive ? "bg-emerald-400" : "bg-cyan"}`} style={{ width: `${Math.max(3, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}

function PipelineStep({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="pipeline-step">
      <div className="pipeline-step-index">{step}</div>
      <div className="mt-4 text-lg font-black text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function VaultItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-slate-300">
      <CheckCircle2 className="text-cyan" size={16} />
      {text}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="label">{label}</div>
      <div className="mt-2 font-mono text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function ModuleTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="glass-card p-4">
      <div className="label">{label}</div>
      <div className="mt-2 text-lg font-black text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </div>
  );
}

function formatMoney(value: number | null): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}
