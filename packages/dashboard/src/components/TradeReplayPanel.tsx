import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BrainCircuit, Clock, Crosshair, FileJson, RadioTower, Shield, Sparkles, Target, X, Zap, type LucideIcon } from "lucide-react";
import type { ReplayCandle, TradeDetail, TradeJournalEntry, TradeTransition } from "../lib/types";
import { trpc } from "../lib/api";
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
  const [liveTrade, setLiveTrade] = useState<TradeDetail | null>(trade);
  const [liveCandles, setLiveCandles] = useState<ReplayCandle[]>(candles);
  const [liveSyncing, setLiveSyncing] = useState(false);

  useEffect(() => {
    setLiveTrade(trade);
  }, [trade]);

  useEffect(() => {
    setLiveCandles(candles);
  }, [candles]);

  useEffect(() => {
    if (!trade?.id || !isOpenStatus(trade.status)) return;
    let alive = true;

    const sync = async () => {
      try {
        setLiveSyncing(true);
        const [detail, nextCandles] = await Promise.all([
          trpc.query("trades.detail", { id: trade.id }) as Promise<TradeDetail | null>,
          trpc.query("trades.candles", { id: trade.id, interval: "15", limit: 260 }) as Promise<ReplayCandle[]>,
        ]);
        if (!alive) return;
        if (detail) setLiveTrade(detail);
        setLiveCandles(nextCandles);
      } finally {
        if (alive) setLiveSyncing(false);
      }
    };

    const timer = setInterval(() => void sync(), 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [trade?.id, trade?.status]);

  if (!trade && !loading) return null;

  const displayTrade = liveTrade ?? trade;
  const events = displayTrade ? buildTimeline(displayTrade) : [];
  const pnl = displayTrade?.pnlUsdt ?? 0;
  const model = displayTrade ? buildReplayModel(displayTrade, liveCandles) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md" onClick={onClose}>
      <aside
        className="trade-replay-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="trade-replay-topbar">
          <div>
            <div className="hero-eyebrow">
              <Sparkles size={14} />
              TradingView-style replay
            </div>
            <h2 className="mt-2 text-3xl font-black text-white md:text-4xl">
              {displayTrade ? `${displayTrade.symbol} ${displayTrade.direction}` : "Loading trade..."}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Povestea completa a trade-ului: intrare, risc, grafic, decizii AI, protectii, jurnal si motivul de exit.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {displayTrade && isOpenStatus(displayTrade.status) ? (
              <span className={`pill ${liveSyncing ? "pill" : "pill-success"}`}>
                <RadioTower size={13} />
                {liveSyncing ? "syncing" : "live"}
              </span>
            ) : null}
            <button className="button" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {loading && <div className="empty-state mt-6">Loading mission control...</div>}

        {displayTrade && model && (
          <div className="mt-6 space-y-5">
            <div className="trade-replay-hero trade-replay-hero-premium">
              <div>
                <div className="label">Paper execution replay</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className={`direction-badge ${displayTrade.direction === "LONG" ? "direction-long" : "direction-short"}`}>{displayTrade.direction}</span>
                  <span className="pill">{displayTrade.status}</span>
                  <span className="pill">{displayTrade.exchange}</span>
                  <span className="pill">{displayTrade.strategyId}</span>
                  <span className={`pill ${model.verdictTone}`}>{model.verdict}</span>
                </div>
              </div>
              <div className={`trade-replay-pnl ${pnl >= 0 ? "trade-replay-pnl-good" : "trade-replay-pnl-bad"}`}>
                <span>{formatSigned(pnl)} USDT</span>
                <small>{formatSigned(displayTrade.pnlPct ?? 0)}% · {model.rMultiple}</small>
              </div>
            </div>

            <div className="trade-replay-kpi-grid">
              <ReplayStat icon={Crosshair} label="Entry" value={formatPrice(displayTrade.entryPrice)} detail={formatDate(displayTrade.openedAt ?? displayTrade.createdAt)} />
              <ReplayStat icon={Zap} label="Exit / Current" value={formatPrice(model.exitOrCurrent)} detail={displayTrade.closedAt ? formatDate(displayTrade.closedAt) : "live paper price"} />
              <ReplayStat icon={Shield} label="SL / TP" value={`${formatPrice(displayTrade.stopLoss)} / ${formatPrice(displayTrade.takeProfit)}`} detail={`${model.riskPct.toFixed(2)}% risk`} />
              <ReplayStat icon={Clock} label="Hold" value={model.holdLabel} detail={displayTrade.closeReason ?? "still managed"} />
            </div>

            <div className="trade-replay-map-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">Position map</div>
                  <h3 className="mt-1 text-xl font-black text-white">Stop · Entry · Target · Current</h3>
                </div>
                <span className="pill">Score {displayTrade.signalScore}</span>
              </div>
              <div className="trade-replay-level-bar mt-6">
                <span className="trade-replay-level-marker trade-replay-level-sl" style={{ left: `${model.slMarker}%` }}>SL</span>
                <span className="trade-replay-level-marker trade-replay-level-entry" style={{ left: `${model.entryMarker}%` }}>IN</span>
                <span className="trade-replay-level-marker trade-replay-level-tp" style={{ left: `${model.tpMarker}%` }}>TP</span>
                <span className="trade-replay-current-marker" style={{ left: `${model.currentMarker}%` }} />
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <Mini label="Risk" value={`${model.riskPct.toFixed(2)}%`} />
                <Mini label="Reward" value={`${model.rewardPct.toFixed(2)}%`} />
                <Mini label="Fees" value={`${formatSigned(displayTrade.feeUsdt ?? 0)} USDT`} />
                <Mini label="Slippage" value={displayTrade.slippage == null ? "-" : displayTrade.slippage.toFixed(4)} />
              </div>
            </div>

            <ProtectionBrain trade={displayTrade} model={model} />

            <TradeReplayChart trade={displayTrade} candles={liveCandles} />

            <div className="trade-replay-split">
              <TimelinePanel events={events} />
              <DecisionPanel trade={displayTrade} model={model} />
            </div>

            <div className="glass-card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">Raw signal snapshot</div>
                  <h3 className="mt-1 text-xl font-black text-white">Debug data</h3>
                </div>
                <span className="pill">
                  <FileJson size={13} />
                  signalData
                </span>
              </div>
              <pre className="max-h-80 overflow-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-5 text-slate-300">
                {JSON.stringify(displayTrade.signalData ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function TimelinePanel({ events }: { events: ReplayEvent[] }) {
  return (
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
            <div className={`trade-timeline-dot trade-timeline-dot-${event.tone}`} />
            <div className="trade-event-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-black text-white">{event.title}</div>
                  <div className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">{event.kind}</div>
                </div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{formatDate(event.time)}</div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionPanel({ trade, model }: { trade: TradeDetail; model: ReplayModel }) {
  return (
    <div className="glass-card trade-decision-card">
      <div className="label">AI decision card</div>
      <h3 className="mt-1 text-xl font-black text-white">{model.aiHeadline}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{model.aiSummary}</p>
      <div className="mt-5 grid gap-3">
        <BrainLine label="Signal score" value={String(trade.signalScore)} />
        <BrainLine label="ML score" value={trade.mlScore == null ? "-" : trade.mlScore.toFixed(2)} />
        <BrainLine label="Regime" value={trade.marketRegime ?? "-"} />
        <BrainLine label="Close reason" value={trade.closeReason ?? "-"} />
        <BrainLine label="Candles loaded" value={String(model.candleCount)} />
        <BrainLine label="Replay verdict" value={model.verdict} />
      </div>
    </div>
  );
}

function buildTimeline(trade: TradeDetail): ReplayEvent[] {
  const openEvent: ReplayEvent = {
    description: `Bot opened ${trade.direction} with entry ${formatPrice(trade.entryPrice)}, stop ${formatPrice(trade.stopLoss)} and target ${formatPrice(trade.takeProfit)}.`,
    kind: "entry",
    time: trade.openedAt ?? trade.createdAt,
    title: "Trade opened",
    tone: "good",
  };

  const closeEvent: ReplayEvent[] = trade.closedAt ? [{
    description: `Trade closed with PnL ${formatSigned(trade.pnlUsdt ?? 0)} USDT. Reason: ${trade.closeReason ?? "not recorded"}.`,
    kind: "exit",
    time: trade.closedAt,
    title: "Trade closed",
    tone: (trade.pnlUsdt ?? 0) >= 0 ? "good" : "bad",
  }] : [];

  const detailed = [
    ...trade.transitions.map((item) => transitionToEvent(item)),
    ...trade.journalEntries.map((item) => journalToEvent(item)),
  ];

  const merged = [openEvent, ...detailed, ...closeEvent]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return dedupeEvents(merged);
}

function transitionToEvent(item: TradeTransition): ReplayEvent {
  const title = `${item.fromState ?? "NEW"} -> ${item.toState}`;
  const tone = item.toState.includes("CLOSED") || item.toState.includes("EXIT") ? "good" : item.toState.includes("REJECT") || item.toState.includes("ERROR") ? "bad" : "info";
  return {
    description: item.reason,
    kind: "state transition",
    time: item.createdAt,
    title,
    tone,
  };
}

function journalToEvent(item: TradeJournalEntry): ReplayEvent {
  const type = item.type.toUpperCase();
  const tone = type.includes("LOSS") || type.includes("DANGER") || type.includes("STOP") ? "bad" : type.includes("PROFIT") || type.includes("BREAKEVEN") || type.includes("TRAIL") ? "good" : "info";
  return {
    description: summarize(item.data),
    kind: "journal",
    time: item.createdAt,
    title: item.type.replaceAll("_", " "),
    tone,
  };
}

function dedupeEvents(events: ReplayEvent[]): ReplayEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.time}-${event.title}-${event.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarize(data: unknown): string {
  if (!data || typeof data !== "object") return String(data ?? "");
  const record = data as Record<string, unknown>;
  const important = ["reason", "primaryCategory", "summary", "price", "previousStop", "nextStop", "netPnl", "remainingSizeUsdt", "stopLoss", "takeProfit", "mode", "confidence"]
    .filter((key) => key in record)
    .map((key) => `${key}: ${String(record[key])}`);
  return important.length ? important.join(" | ") : JSON.stringify(record).slice(0, 260);
}

function ProtectionBrain({ trade, model }: { trade: TradeDetail; model: ReplayModel }) {
  const protection = readProtection(trade.signalData);
  const lossAnalysis = trade.journalEntries.find((item) => item.type === "TRADE_LOSS_ANALYZED")?.data as Record<string, unknown> | undefined;
  const partials = trade.journalEntries.filter((item) => item.type === "PAPER_PARTIAL_TAKE_PROFIT");

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="glass-card">
        <div className="label">Protection engine</div>
        <div className="mt-4 grid gap-3">
          <ProtectionRow label="TP1" active={Boolean(protection?.tp1Hit)} onText="Hit" offText="Waiting" />
          <ProtectionRow label="TP2" active={Boolean(protection?.tp2Hit)} onText="Hit" offText="Waiting" />
          <ProtectionRow label="Breakeven" active={Boolean(protection?.breakevenMoved)} onText="Moved" offText="Not yet" />
          <ProtectionRow label="Trailing" active={Boolean(protection?.trailingActivated)} onText="Active" offText="Inactive" />
        </div>
      </div>
      <div className="glass-card">
        <div className="label">Partial PnL</div>
        <div className="mt-4 grid gap-3">
          <BrainLine label="Events" value={String(partials.length)} />
          <BrainLine label="Realized" value={`${formatSigned(Number(protection?.partialRealizedPnlUsdt ?? 0))} USDT`} />
          <BrainLine label="Fees" value={`${Number(protection?.partialFeeUsdt ?? 0).toFixed(2)} USDT`} />
          <BrainLine label="Initial size" value={`${Number(protection?.initialPositionSizeUsdt ?? 0).toFixed(2)} USDT`} />
          <BrainLine label="Current R" value={model.rMultiple} />
        </div>
      </div>
      <div className="glass-card">
        <div className="label">Loss brain</div>
        <div className="mt-4 grid gap-3">
          <BrainLine label="Category" value={String(lossAnalysis?.primaryCategory ?? "n/a")} />
          <BrainLine label="Severity" value={String(lossAnalysis?.severity ?? "n/a")} />
          <BrainLine label="Score penalty" value={lossAnalysis?.suggestedScorePenalty == null ? "-" : `+${String(lossAnalysis.suggestedScorePenalty)} required`} />
          <BrainLine label="Cooldown" value={lossAnalysis?.suggestedCooldownMinutes == null ? "-" : `${String(lossAnalysis.suggestedCooldownMinutes)} min`} />
          <p className="text-sm leading-6 text-slate-300">{String(lossAnalysis?.summary ?? "No loss analysis for winning/open trades.")}</p>
          <p className="text-xs leading-5 text-slate-500">{firstAdaptiveAction(lossAnalysis)}</p>
        </div>
      </div>
    </div>
  );
}

function buildReplayModel(trade: TradeDetail, candles: ReplayCandle[]): ReplayModel {
  const entry = trade.entryPrice ?? candles.at(-1)?.close ?? 0;
  const exitOrCurrent = trade.exitPrice ?? candles.at(-1)?.close ?? entry;
  const low = Math.min(trade.stopLoss, trade.takeProfit, entry, exitOrCurrent);
  const high = Math.max(trade.stopLoss, trade.takeProfit, entry, exitOrCurrent);
  const risk = Math.abs(entry - trade.stopLoss);
  const reward = Math.abs(trade.takeProfit - entry);
  const move = trade.direction === "LONG" ? exitOrCurrent - entry : entry - exitOrCurrent;
  const r = risk > 0 ? move / risk : 0;
  const isWinner = (trade.pnlUsdt ?? 0) > 0 || (isOpenStatus(trade.status) && r > 0);
  const verdict = trade.status === "CLOSED" ? (isWinner ? "WIN" : "LOSS") : r >= 0 ? "OPEN IN PROFIT" : "OPEN UNDER PRESSURE";
  const verdictTone = verdict.includes("WIN") || verdict.includes("PROFIT") ? "pill-success" : verdict.includes("PRESSURE") || verdict.includes("LOSS") ? "pill-danger" : "";
  const aiHeadline = trade.status === "CLOSED"
    ? isWinner ? "Setup closed green; preserve the pattern." : "Setup closed red; loss brain should explain the weak point."
    : r >= 0 ? "Open trade is developing in the right direction." : "Open trade is active but still inside risk zone.";

  return {
    aiHeadline,
    aiSummary: buildAiSummary(trade, r, candles.length),
    candleCount: candles.length,
    currentMarker: normalize(exitOrCurrent, low, high),
    entryMarker: normalize(entry, low, high),
    exitOrCurrent,
    holdLabel: trade.holdTimeSeconds == null ? timeBetween(trade.openedAt ?? trade.createdAt, trade.closedAt ?? new Date().toISOString()) : `${Math.round(trade.holdTimeSeconds / 60)}m`,
    rMultiple: `${formatSigned(r)}R`,
    rewardPct: entry > 0 ? (reward / entry) * 100 : 0,
    riskPct: entry > 0 ? (risk / entry) * 100 : 0,
    slMarker: normalize(trade.stopLoss, low, high),
    tpMarker: normalize(trade.takeProfit, low, high),
    verdict,
    verdictTone,
  };
}

function buildAiSummary(trade: TradeDetail, r: number, candleCount: number): string {
  if (trade.status === "CLOSED") {
    return `Trade-ul s-a inchis cu motivul "${trade.closeReason ?? "not recorded"}", scor ${trade.signalScore}, ${formatSigned(trade.pnlUsdt ?? 0)} USDT PnL si ${formatSigned(r)}R. Replay-ul foloseste ${candleCount} candles pentru context.`;
  }
  return `Trade-ul este inca deschis. Botul urmareste current price fata de SL/TP, cu scor ${trade.signalScore} si ${formatSigned(r)}R in momentul replay-ului.`;
}

function ReplayStat({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail?: string }) {
  return (
    <div className="trade-replay-stat">
      <div className="metric-icon tone-cyan"><Icon size={16} /></div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-black text-white">{value}</div>
      {detail ? <div className="mt-1 line-clamp-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function BrainLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2">
      <span className="text-slate-400">{label}</span>
      <strong className="text-right text-white">{value}</strong>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="label">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-black text-white">{value}</div>
    </div>
  );
}

function ProtectionRow({ label, active, onText, offText }: { label: string; active: boolean; onText: string; offText: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
      <span className="text-slate-400">{label}</span>
      <span className={`pill ${active ? "pill-success" : ""}`}>{active ? onText : offText}</span>
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

function normalize(value: number, low: number, high: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) return 50;
  return Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
}

function isOpenStatus(status: string): boolean {
  return ["OPEN", "FILLED", "CLOSING"].includes(status);
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100) return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function timeBetween(start: string | null, end: string): string {
  if (!start) return "-";
  const diff = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

interface ReplayEvent {
  description: string;
  kind: string;
  time: string;
  title: string;
  tone: "good" | "bad" | "info";
}

interface ReplayModel {
  aiHeadline: string;
  aiSummary: string;
  candleCount: number;
  currentMarker: number;
  entryMarker: number;
  exitOrCurrent: number;
  holdLabel: string;
  rMultiple: string;
  rewardPct: number;
  riskPct: number;
  slMarker: number;
  tpMarker: number;
  verdict: string;
  verdictTone: string;
}
