import { useEffect, useState } from "react";
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
    <div className="space-y-5">
      <div><div className="label">Operations</div><h1 className="mt-2 text-3xl font-bold">Control room</h1></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4">
          <div className="label">Bot control</div>
          <div className="flex gap-3"><button className="button flex-1" onClick={() => void setStatus("PAUSED")}>Pause</button><button className="button flex-1 border-emerald-500/40 text-emerald-300" onClick={() => void setStatus("RUNNING")}>Resume</button></div>
          <KillSwitch onDone={() => { refresh(); void refreshAudit(); }} />
          {message && <p className="text-sm text-cyan">{message}</p>}
        </div>
        <div className="card space-y-4">
          <div className="label">Runtime parameters</div>
          {Object.entries(metrics.adaptiveConfig).slice(0, 3).map(([key, value]) => <label className="block" key={key}><span className="mb-2 block text-sm text-slate-400">{key}</span><input className="input" type="number" defaultValue={value} /></label>)}
          <button className="button">Validate changes</button>
        </div>
      </div>
      <div className="card">
        <div className="label">Notification tests</div>
        <div className="mt-4 flex gap-3"><button className="button" onClick={() => void trpc.mutation("control.testNotification", { channel: "telegram" })}>Test Telegram</button><button className="button" onClick={() => void trpc.mutation("control.testNotification", { channel: "discord" })}>Test Discord</button></div>
      </div>
      <div className="card">
        <div className="label">Audit log</div>
        <div className="mt-4 max-h-80 overflow-auto text-sm">
          {audit.map((entry) => <div className="grid grid-cols-[150px_140px_1fr] gap-3 border-b border-border py-2" key={entry.id}><span className="text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span><span className="text-cyan">{entry.action}</span><span className="text-slate-400">{entry.actor}{entry.ipAddress ? ` · ${entry.ipAddress}` : ""}</span></div>)}
          {!audit.length && <p className="text-slate-500">No audit entries yet.</p>}
        </div>
      </div>
      <div className="card"><div className="label">System</div><div className="mt-4 text-sm text-slate-400">Obsidra v0.1.0 · Railway-ready · status {metrics.botStatus}</div></div>
    </div>
  );
}
