import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { SafetySupervisorStatus } from "../lib/types";

export function SafetySupervisor({ status }: { status?: SafetySupervisorStatus }) {
  const level = status?.level ?? "WATCH";
  const Icon = level === "OK" ? ShieldCheck : level === "DANGER" ? ShieldX : ShieldAlert;
  const tone = level === "OK" ? "tone-emerald" : level === "DANGER" ? "tone-rose" : "tone-amber";
  return (
    <section className="glass-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className={`metric-icon ${tone}`}><Icon size={20} /></div>
          <div>
            <div className="label">AI Safety Supervisor</div>
            <h3 className="mt-2 text-2xl font-black">{level}</h3>
            <p className="mt-2 text-sm text-slate-400">{status?.summary ?? "Waiting for supervisor telemetry."}</p>
          </div>
        </div>
        <div className="score-ring" style={{ "--score": `${status?.score ?? 0}%` } as React.CSSProperties}>{status?.score ?? 0}</div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(status?.checks ?? []).map((check) => (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4" key={check.name}>
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-white">{check.name}</div>
              <span className={`pill ${check.status === "PASS" ? "pill-success" : check.status === "FAIL" ? "pill-danger" : ""}`}>{check.status}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">{check.detail}</p>
          </div>
        ))}
        {!status?.checks?.length && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
            Supervisor checks will appear after the next metrics refresh.
          </div>
        )}
      </div>
    </section>
  );
}
