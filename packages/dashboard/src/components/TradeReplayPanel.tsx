import { Activity, Clock, Crosshair, Shield, X, Zap } from "lucide-react";
import type { ReplayCandle, TradeDetail } from "../lib/types";
import { TradeReplayChart } from "./TradeReplayChart";

export function TradeReplayPanel({
  trade,
  candles = [],
  loading,
  onClose,
}: {
  trade: TradeDetail | null;
  candles?: ReplayCandle[];
  loading: boolean;
  onClose: () => void;
}) {
  if (!trade && !loading) return null;
  const events = trade ? buildTimeline(trade) : [];
  const pnl = trade?.pnlUsdt ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-[#070a12]/95 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label">TradingView-style replay</div>
            <h2 className="mt-2 text-3xl font-black text-white">
              {trade ? `${trade.symbol} ${trade.direction}` : "Loading trade..."}
            </h2>
            <p className="mt-2 text-sm text-slate-400">Live story of what the bot saw, decided, protected, and closed.</p>
          </div>
          <button className="button" onClick={onClose}><X size={16} /></button>
        </div>

        {loading && <div className="empty-state mt-6">Loading mission control...</div>}

        {trade && (
          <div className="mt-6 space-y-5">
            <div className="trade-replay-hero">
              <div>
                <div className="label">Paper position</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className={`direction-badge ${trade.direction === "LONG" ? "direction-long" : "direction-short"}`}>{trade.direction}</span>
                  <span className="pill">{trade.status}</span>
                  <span className="pill">{trade.exchange}</span>
                  <span className="pill">{trade.strategyId}</span>
                </div>
              </div>
              <div className={`text-right font-mono text-3xl font-black ${pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {formatSigned(pnl)} USDT
                <div className="mt-1 text-sm text-slate-400">{formatSigned(trade.pnlPct ?? 0)}%</div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <ReplayStat icon={Crosshair} label="Entry" value={formatPrice(trade.entryPrice)} />
              <ReplayStat icon={Zap} label="Exit" value={formatPrice(trade.exitPrice)} />
              <ReplayStat icon={Shield} label="SL / TP" value={`${formatPrice(trade.stopLoss)} / ${formatPrice(trade.takeProfit)}`} />
              <ReplayStat icon={Clock} label="Hold" value={trade.holdTimeSeconds == null ? "-" : `${Math.round(trade.holdTimeSeconds / 60)}m`} />
            </div>

            <ProtectionBrain trade={trade} />

            <TradeReplayChart trade={trade} candles={candles} />

            <div className="glass-card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="label">Replay timeline</div>
                  <h3 className="mt-1 text-xl font-black">Every bot decision</h3>
                </div>
                <span className="pill">{events.length} events</span>
              </div>
              <div className="trade-timeline">
                {events.map((event, index) => (
                  <div className="trade-timeline-row" key={`${event.time}-${event.title}-${index}`}>
                    <div className="trade-timeline-dot" />
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="font-black text-white">{event.title}</div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{new Date(event.time).toLocaleString()}</div>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="glass-card">
                <div className="label">Signal brain</div>
                <div className="mt-4 grid gap-3">
                  <BrainLine label="Score" value={String(trade.signalScore)} />
                  <BrainLine label="ML score" value={trade.mlScore == null ? "-" : trade.mlScore.toFixed(2)} />
                  <BrainLine label="Regime" value={trade.marketRegime ?? "-"} />
                  <BrainLine label="Close reason" value={trade.closeReason ?? "-"} />
                </div>
              </div>
              <div className="glass-card">
                <div className="label">Raw signal snapshot</div>
                <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-black/35 p-4 text-xs leading-5 text-slate-300">
                  {JSON.stringify(trade.signalData ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function buildTimeline(trade: TradeDetail) {
  const base = [
    ...trade.transitions.map((item) => ({
      time: item.createdAt,
      title: `${item.fromState ?? "NEW"} -> ${item.toState}`,
      description: item.reason,
    })),
    ...trade.journalEntries.map((item) => ({
      time: item.createdAt,
      title: item.type.replaceAll("_", " "),
      description: summarize(item.data),
    })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  if (!base.length) {
    return [{
      time: trade.createdAt,
      title: "Trade recorded",
      description: "No detailed journal entries are attached yet.",
    }];
  }
  return base;
}

function summarize(data: unknown): string {
  if (!data || typeof data !== "object") return String(data ?? "");
  const record = data as Record<string, unknown>;
  const important = ["reason", "primaryCategory", "summary", "price", "previousStop", "nextStop", "netPnl", "remainingSizeUsdt", "stopLoss", "mode"]
    .filter((key) => key in record)
    .map((key) => `${key}: ${String(record[key])}`);
  return important.length ? important.join(" | ") : JSON.stringify(record).slice(0, 240);
}

function ProtectionBrain({ trade }: { trade: TradeDetail }) {
  const protection = readProtection(trade.signalData);
  const lossAnalysis = trade.journalEntries.find((item) => item.type === "TRADE_LOSS_ANALYZED")?.data as Record<string, unknown> | undefined;
  const partials = trade.journalEntries.filter((item) => item.type === "PAPER_PARTIAL_TAKE_PROFIT");
  if (!protection && !lossAnalysis && !partials.length) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="glass-card">
        <div className="label">Protection engine</div>
        <div className="mt-4 grid gap-3">
          <BrainLine label="TP1" value={protection?.tp1Hit ? "Hit" : "Waiting"} />
          <BrainLine label="TP2" value={protection?.tp2Hit ? "Hit" : "Waiting"} />
          <BrainLine label="Breakeven" value={protection?.breakevenMoved ? "Moved" : "Not yet"} />
          <BrainLine label="Trailing" value={protection?.trailingActivated ? "Active" : "Inactive"} />
        </div>
      </div>
      <div className="glass-card">
        <div className="label">Partial PnL</div>
        <div className="mt-4 grid gap-3">
          <BrainLine label="Events" value={String(partials.length)} />
          <BrainLine label="Realized" value={`${formatSigned(Number(protection?.partialRealizedPnlUsdt ?? 0))} USDT`} />
          <BrainLine label="Fees" value={`${Number(protection?.partialFeeUsdt ?? 0).toFixed(2)} USDT`} />
          <BrainLine label="Initial size" value={`${Number(protection?.initialPositionSizeUsdt ?? 0).toFixed(2)} USDT`} />
        </div>
      </div>
      <div className="glass-card">
        <div className="label">Loss brain</div>
        <div className="mt-4 grid gap-3">
          <BrainLine label="Category" value={String(lossAnalysis?.primaryCategory ?? "n/a")} />
          <BrainLine label="Severity" value={String(lossAnalysis?.severity ?? "n/a")} />
          <BrainLine label="Score penalty" value={lossAnalysis?.suggestedScorePenalty == null ? "-" : `+${String(lossAnalysis.suggestedScorePenalty)} required`} />
          <BrainLine label="Cooldown" value={lossAnalysis?.suggestedCooldownMinutes == null ? "-" : `${String(lossAnalysis.suggestedCooldownMinutes)} min`} />
          <BrainLine label="Confidence" value={lossAnalysis?.confidence == null ? "-" : `${(Number(lossAnalysis.confidence) * 100).toFixed(0)}%`} />
          <p className="text-sm leading-6 text-slate-300">{String(lossAnalysis?.summary ?? "No loss analysis for winning/open trades.")}</p>
          <p className="text-xs leading-5 text-slate-500">{firstAdaptiveAction(lossAnalysis)}</p>
        </div>
      </div>
    </div>
  );
}

function readProtection(signalData: Record<string, unknown> | undefined) {
  const value = signalData?.paperProtection;
  return value && typeof value === "object" ? value as {
    initialPositionSizeUsdt?: number;
    initialStopLoss?: number;
    partialRealizedPnlUsdt?: number;
    partialFeeUsdt?: number;
    tp1Hit?: boolean;
    tp2Hit?: boolean;
    breakevenMoved?: boolean;
    trailingActivated?: boolean;
  } : null;
}

function firstAdaptiveAction(lossAnalysis: Record<string, unknown> | undefined): string {
  const actions = lossAnalysis?.adaptiveActions;
  if (!Array.isArray(actions) || !actions.length) return "No adaptive action required yet.";
  const first = actions[0] as Record<string, unknown>;
  return `${String(first.action ?? "action")}: ${String(first.reason ?? "no reason")}`;
}

function ReplayStat({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="metric-icon tone-cyan"><Icon size={16} /></div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 font-mono text-lg font-black text-white">{value}</div>
    </div>
  );
}

function BrainLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2">
      <span className="text-slate-400">{label}</span>
      <strong className="text-right text-white">{value}</strong>
    </div>
  );
}

function formatPrice(value: number | null): string {
  if (value == null) return "-";
  return `$${value.toFixed(Math.abs(value) >= 100 ? 2 : 4)}`;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
