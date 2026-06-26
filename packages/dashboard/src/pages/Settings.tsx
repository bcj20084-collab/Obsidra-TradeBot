import { useEffect, useState } from "react";
import { BellRing, Pause, Play, ShieldAlert, Terminal } from "lucide-react";
import type { AuditEntry, Metrics } from "../lib/types";
import { trpc } from "../lib/api";
import { KillSwitch } from "../components/KillSwitch";

export function Settings({ metrics, refresh }: { metrics: Metrics; refresh: () => void }) {
  const [message, setMessage] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const refreshAudit = async () => {
    const rows = await trpc.query("audit.list", { limit: 100 }) as AuditEntry[];
    setAudit(rows);
  };

  useEffect(() => { void refreshAudit(); }, []);

  const setStatus = async (status: "RUNNING" | "PAUSED") => {
    await trpc.mutation("control.setStatus", { status, reason: "Dashboard control" });
    setMessage(`Bot is now ${status.toLowerCase()}.`);
    refresh();
    void refreshAudit();
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Operations</div>
        <h1 className="mt-2 text-4xl font-black">Control room</h1>
        <p className="mt-2 text-sm text-slate-400">Pause, resume, test notifications, and review the operator audit trail.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
        <div className="glass-card space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="label">Bot control</div>
              <h2 className="mt-2 text-2xl font-black">{metrics.botStatus}</h2>
            </div>
            <ShieldAlert className="text-amber-300" size={28} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="button flex items-center justify-center gap-2" onClick={() => void setStatus("PAUSED")}><Pause size={16} /> Pause</button>
            <button className="button glow-button flex items-center justify-center gap-2 border-emerald-500/30 text-emerald-300" onClick={() => void setStatus("RUNNING")}><Play size={16} /> Resume</button>
          </div>
          <KillSwitch onDone={() => { refresh(); void refreshAudit(); }} />
          {message && <p className="rounded-2xl border border-cyan/20 bg-cyan/10 p-3 text-sm text-cyan">{message}</p>}
        </div>

        <div className="glass-card space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="label">Notification tests</div>
              <h2 className="mt-2 text-2xl font-black">Signal channels</h2>
            </div>
            <BellRing className="text-cyan" size={28} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="button" onClick={() => void trpc.mutation("control.testNotification", { channel: "telegram" })}>Test Telegram</button>
            <button className="button" onClick={() => void trpc.mutation("control.testNotification", { channel: "discord" })}>Test Discord</button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-400">
            Runtime is configured for paper-first operation. Exchange API secrets are never displayed in this dashboard.
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="mb-4 flex items-center gap-3">
          <Terminal className="text-cyan" size={20} />
          <div>
            <div className="label">Audit log</div>
            <h2 className="mt-1 text-2xl font-black">Operator actions</h2>
          </div>
        </div>
        <div className="max-h-96 overflow-auto text-sm">
          {audit.map((entry) => (
            <div className="grid gap-2 border-t border-white/10 py-3 md:grid-cols-[180px_180px_1fr]" key={entry.id}>
              <span className="text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
              <span className="font-mono text-cyan">{entry.action}</span>
              <span className="text-slate-400">{entry.actor}{entry.ipAddress ? ` · ${entry.ipAddress}` : ""}</span>
            </div>
          ))}
          {!audit.length && <p className="text-slate-500">No audit entries yet.</p>}
        </div>
      </div>

      <div className="glass-card">
        <div className="label">System</div>
        <div className="mt-4 text-sm text-slate-400">Obsidra v1.0.0 · Node 24 · Railway-ready · status {metrics.botStatus}</div>
      </div>
    </div>
  );
}
