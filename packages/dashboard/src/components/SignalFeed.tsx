import { BrainCircuit, CheckCircle2, ShieldAlert, SkipForward, Wrench } from "lucide-react";
import type { SignalFeedItem } from "../lib/types";

const meta = {
  SIGNAL_READY: { icon: CheckCircle2, label: "Ready", className: "pill-success" },
  SIGNAL_GENERATED: { icon: CheckCircle2, label: "Generated", className: "pill-success" },
  SIGNAL_SKIPPED: { icon: SkipForward, label: "Skipped", className: "" },
  RISK_REJECTED: { icon: ShieldAlert, label: "Risk", className: "pill-danger" },
  PAPER_PARTIAL_TAKE_PROFIT: { icon: CheckCircle2, label: "Partial TP", className: "pill-success" },
  PAPER_PROTECTION_UPDATED: { icon: Wrench, label: "Protection", className: "" },
  PAPER_POSITION_DANGER: { icon: ShieldAlert, label: "Near SL", className: "pill-danger" },
  TRADE_LOSS_ANALYZED: { icon: ShieldAlert, label: "Loss brain", className: "pill-danger" },
};

export function SignalFeed({ items }: { items: SignalFeedItem[] }) {
  return (
    <section className="glass-card">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Bot thinking</div>
          <h3 className="mt-2 text-2xl font-black">Live signal feed</h3>
          <p className="mt-2 text-sm text-slate-400">Every scan explains whether the bot is ready, skipping, rejecting, or protecting a paper position.</p>
        </div>
        <div className="pill"><BrainCircuit size={14} className="mr-2" /> {items.length} events</div>
      </div>

      <div className="space-y-3">
        {items.slice(0, 12).map((item) => {
          const current = meta[item.type as keyof typeof meta] ?? { icon: BrainCircuit, label: item.type, className: "" };
          const Icon = current.icon;
          return (
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="metric-icon tone-cyan"><Icon size={17} /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-white">{item.symbol}</span>
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.exchange}</span>
                      {item.direction && <span className={`direction-badge ${item.direction === "LONG" ? "direction-long" : "direction-short"}`}>{item.direction}</span>}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{humanReason(item.reason)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <span className={`pill ${current.className}`}>{current.label}</span>
                  {item.score !== null && <span className="pill">Score {item.score}</span>}
                  <span className="pill">{new Date(item.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
                <FeedMetric label="Price" value={format(item.price)} />
                <FeedMetric label="SL" value={format(item.stopLoss)} />
                <FeedMetric label="TP" value={format(item.takeProfit)} />
                <FeedMetric label="Regime" value={item.regime || "-"} />
              </div>
              <GateStrip details={item.details} />
            </div>
          );
        })}
        {!items.length && (
          <div className="empty-state">
            <div className="text-lg font-bold text-white">No signal events yet</div>
            <p className="mt-2 text-sm text-slate-400">The feed will populate after the next scan cycle.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function GateStrip({ details }: { details: Record<string, unknown> }) {
  const gates = [
    ["H1", `${text(details.h1Trend)}${details.h1Conflict ? " conflict" : ""}`],
    ["BTC", `${text(details.btcTrend)}${details.btcConflict ? " conflict" : ""}`],
    ["Volume", number(details.volumeRatio, "x", 2)],
    ["Chop", number(details.choppiness, "", 1)],
    ["Spike", number(details.momentumSpikePct, "%", 2)],
    ["Idle", number(details.idleHours, "h", 1)],
  ].filter(([, value]) => value && value !== "-");
  if (!gates.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {gates.map(([label, value]) => (
        <span className="pill" key={label}>{label}: {value}</span>
      ))}
    </div>
  );
}

function FeedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="label">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function format(value: number | null): string {
  if (value === null) return "-";
  return value >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function humanReason(reason: string): string {
  return reason.replaceAll("_", " ").toLowerCase().replace(/^\w/, (value) => value.toUpperCase());
}

function text(value: unknown): string {
  return typeof value === "string" && value ? value : "-";
}

function number(value: unknown, suffix: string, digits: number): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "-";
}
