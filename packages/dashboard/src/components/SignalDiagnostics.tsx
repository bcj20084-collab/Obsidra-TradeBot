import { Activity, BarChart3, BrainCircuit, Gauge, Radar } from "lucide-react";
import type { SignalFeedItem } from "../lib/types";

export function SignalDiagnostics({ signals }: { signals: SignalFeedItem[] }) {
  const reasons = countBy(signals, (item) => item.reason || item.type).slice(0, 5);
  const skipped = signals.filter((item) => item.type === "SIGNAL_SKIPPED" || item.type === "RISK_REJECTED").length;
  const ready = signals.filter((item) => item.type === "SIGNAL_READY" || item.type === "SIGNAL_GENERATED").length;
  const conflicts = signals.filter((item) => item.details?.h1Conflict || item.details?.btcConflict).length;
  const avgVolume = average(signals.map((item) => asNumber(item.details?.volumeRatio)).filter(isNumber));
  const avgChop = average(signals.map((item) => asNumber(item.details?.choppiness)).filter(isNumber));

  return (
    <section className="glass-card">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Signal diagnostics</div>
          <h3 className="mt-2 text-2xl font-black">Why the bot enters or skips</h3>
          <p className="mt-2 text-sm text-slate-400">Advanced gates from the old bot are now visible: HTF trend, BTC filter, volume, chop and spike.</p>
        </div>
        <div className="pill"><BrainCircuit size={14} className="mr-2" /> {signals.length} scans</div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <DiagTile icon={Activity} label="Ready" value={String(ready)} tone="good" />
        <DiagTile icon={Radar} label="Skipped" value={String(skipped)} tone="warn" />
        <DiagTile icon={Gauge} label="Conflicts" value={String(conflicts)} />
        <DiagTile icon={BarChart3} label="Avg vol/chop" value={`${fmt(avgVolume)}x / ${fmt(avgChop)}`} />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-5">
        {reasons.map(([reason, count]) => (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4" key={reason}>
            <div className="label">{human(reason)}</div>
            <div className="mt-2 text-2xl font-black text-white">{count}</div>
          </div>
        ))}
        {!reasons.length && <div className="empty-state lg:col-span-5">No signal diagnostics yet.</div>}
      </div>
    </section>
  );
}

function DiagTile({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className={`metric-icon ${tone === "good" ? "tone-emerald" : tone === "warn" ? "tone-amber" : "tone-cyan"}`}><Icon size={16} /></div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 font-mono text-xl font-black text-white">{value}</div>
    </div>
  );
}

function countBy(items: SignalFeedItem[], keyFn: (item: SignalFeedItem) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(keyFn(item), (counts.get(keyFn(item)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function human(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}
