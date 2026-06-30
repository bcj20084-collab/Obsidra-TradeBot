import { Activity, ArrowDownRight, ArrowUpRight, Bot, Radar, Shield, Target, Zap } from "lucide-react";
import type { Metrics, SignalFeedItem, Trade } from "../lib/types";
import { DeepHealthPanel } from "../components/DeepHealthPanel";
import { EquityCurve } from "../components/EquityCurve";
import { MetricsCards } from "../components/MetricsCards";
import { PremiumIntelligence } from "../components/PremiumIntelligence";
import { SafetySupervisor } from "../components/SafetySupervisor";
import { SignalDiagnostics } from "../components/SignalDiagnostics";
import { SignalFeed } from "../components/SignalFeed";
import { TopBotParity } from "../components/TopBotParity";
import { TradeTable } from "../components/TradeTable";

export function Overview({ metrics, trades, signals }: { metrics: Metrics; trades: Trade[]; signals: SignalFeedItem[] }) {
  const equity = 10_000 + metrics.totalPnlUsdt;
  const openTrades = trades.filter((trade) => ["OPEN", "FILLED", "CLOSING"].includes(trade.status));
  const openPositions = metrics.openPositionsCount ?? openTrades.length;
  const closedTrades = trades.filter((trade) => trade.status === "CLOSED");
  const latestTrade = trades[0];
  const pnlPositive = metrics.totalPnlUsdt >= 0;

  return (
    <div className="space-y-6">
      <section className="hero-grid">
        <div className="glass-card hero-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label">Portfolio intelligence</div>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white md:text-5xl">
                Paper trading cockpit for Binance market flow.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
                Obsidra is scanning BTCUSDT and ETHUSDT, running risk checks, and simulating entries before real exchange execution is enabled.
              </p>
            </div>
            <div className={`hero-pnl ${pnlPositive ? "text-emerald-300" : "text-rose-300"}`}>
              <span>{pnlPositive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</span>
              {metrics.totalPnlUsdt.toFixed(2)} USDT
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-4">
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

      <PremiumIntelligence metrics={metrics} trades={trades} signals={signals} />

      <MetricsCards metrics={metrics} />

      <DeepHealthPanel />

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
        <TradeTable trades={trades.slice(0, 8)} compact />
      </section>

      <SignalFeed items={signals} />

      <TopBotParity />
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="label">{label}</div>
      <div className="mt-2 font-mono text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function formatMoney(value: number | null): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}
