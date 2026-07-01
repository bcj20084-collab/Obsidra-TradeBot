import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Clock3, DatabaseZap, GitBranch, RadioTower, Rocket, ShieldCheck, Terminal, Wifi } from "lucide-react";
import { fetchDeepHealth } from "../lib/api";
import type { DeepHealth } from "../lib/types";

export function SystemDeployCenter() {
  const [health, setHealth] = useState<DeepHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => void fetchDeepHealth()
      .then((next) => {
        if (!alive) return;
        setHealth(next);
        setError("");
      })
      .catch(() => {
        if (alive) setError("Health API unavailable");
      });
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const deploy = health?.deploy;
  const running = Boolean(health?.ok && health.db && health.botStatus === "RUNNING");
  const pullback = health?.pullbackControl;
  const lastSignal = health?.latestSignalEvent;
  const commit = deploy?.commitSha ? deploy.commitSha.slice(0, 8) : "railway";
  const domain = deploy?.railwayPublicDomain ?? deploy?.railwayStaticUrl ?? "dashboard";

  return (
    <section className="system-deploy-center glass-card">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="hero-eyebrow">
            <Rocket size={14} />
            System health / deploy center
          </div>
          <h3 className="mt-3 text-3xl font-black tracking-tight text-white">Tot bot-ul într-un singur panou.</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Verificare rapidă pentru API, DB, runtime, deploy, semnale, poziții și regula Telegram clean mode.
          </p>
        </div>
        <div className="system-status-orb">
          <span className={running ? "is-live" : "is-warn"} />
          <div>
            <div className="label">System state</div>
            <div className="mt-1 text-2xl font-black text-white">{error || (running ? "ONLINE" : health?.botStatus ?? "SYNCING")}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeployStat icon={Bot} label="Bot" value={health?.botStatus ?? "Loading"} detail={health?.botReason ?? "Runtime state"} tone={running ? "good" : "warn"} />
        <DeployStat icon={DatabaseZap} label="Database" value={health?.db ? "Connected" : "Offline"} detail="Prisma health check" tone={health?.db ? "good" : "bad"} />
        <DeployStat icon={Clock3} label="Uptime" value={health ? formatDuration(health.uptimeSeconds) : "—"} detail={deploy?.startedAt ? `Started ${formatTime(deploy.startedAt)}` : "Waiting"} />
        <DeployStat icon={RadioTower} label="Signals 24h" value={`${health?.signalsReady24h ?? 0} ready`} detail={`${health?.signalsSkipped24h ?? 0} skipped`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_.9fr]">
        <div className="deploy-console-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Deploy identity</div>
              <div className="mt-1 text-xl font-black text-white">{deploy?.railwayServiceName ?? "Obsidra service"}</div>
            </div>
            <span className="pill">{deploy?.railwayEnvironmentName ?? deploy?.nodeEnv ?? "runtime"}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoLine icon={GitBranch} label="Branch / commit" value={`${deploy?.commitBranch ?? "main"} / ${commit}`} />
            <InfoLine icon={Wifi} label="Domain" value={domain} />
            <InfoLine icon={Terminal} label="Region" value={deploy?.railwayReplicaRegion ?? "Railway"} />
            <InfoLine icon={ShieldCheck} label="Mode" value="Paper-first / secrets hidden" />
            <InfoLine icon={Rocket} label="Deployment" value={deploy?.deploymentId ?? "hidden"} />
            <InfoLine icon={DatabaseZap} label="Project" value={deploy?.projectId ?? "hidden"} />
          </div>
        </div>

        <div className="deploy-console-card">
          <div className="label">Operational checklist</div>
          <div className="mt-4 space-y-3">
            <ChecklistItem ok={Boolean(health?.ok)} label="API responding" detail={health?.service ?? "obsidra-api"} />
            <ChecklistItem ok={Boolean(health?.db)} label="Database reachable" detail="Deep health query completed" />
            <ChecklistItem ok={health?.botStatus === "RUNNING"} label="Engine running" detail={health?.botReason ?? "Bot state singleton"} />
            <ChecklistItem ok={Boolean(pullback)} label="DOGE Pullback loaded" detail={pullback ? `${pullback.healthLevel} / edge ${pullback.edgeScore}` : "No pullback control"} />
            <ChecklistItem ok label="Telegram clean mode" detail="Bot ON, valid signal, opened, WIN/LOSS, /status manual" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <FlowCard
          title="Latest signal"
          icon={RadioTower}
          value={lastSignal?.type ?? "Waiting"}
          detail={lastSignal ? formatTime(lastSignal.createdAt) : "No recent event"}
        />
        <FlowCard
          title="DOGE Pullback"
          icon={ShieldCheck}
          value={pullback ? `${pullback.status} / ${pullback.direction}` : "Not loaded"}
          detail={pullback?.reason ?? "Waiting for strategy control data"}
        />
        <FlowCard
          title="Positions"
          icon={CheckCircle2}
          value={`${health?.openPositionsCount ?? 0} open`}
          detail={health?.latestOpenTrade ? `${health.latestOpenTrade.symbol} ${health.latestOpenTrade.direction}` : "No active paper trade"}
        />
      </div>
    </section>
  );
}

function DeployStat({ icon: Icon, label, value, detail, tone }: { icon: typeof Bot; label: string; value: string; detail: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="deploy-stat">
      <div className={`metric-icon ${tone === "good" ? "tone-emerald" : tone === "bad" ? "tone-rose" : tone === "warn" ? "tone-amber" : "tone-cyan"}`}>
        <Icon size={17} />
      </div>
      <div className="mt-3 label">{label}</div>
      <div className="mt-1 truncate text-xl font-black text-white">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center gap-2 text-slate-500"><Icon size={14} /><span className="label">{label}</span></div>
      <div className="mt-2 truncate font-mono text-sm font-black text-white">{value}</div>
    </div>
  );
}

function ChecklistItem({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className={`rounded-2xl border p-3 ${ok ? "border-emerald-400/20 bg-emerald-400/10" : "border-rose-400/20 bg-rose-400/10"}`}>
      <div className="flex items-center gap-2 font-black text-white">
        <CheckCircle2 className={ok ? "text-emerald-300" : "text-rose-300"} size={16} />
        {label}
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div>
    </div>
  );
}

function FlowCard({ title, icon: Icon, value, detail }: { title: string; icon: typeof Bot; value: string; detail: string }) {
  return (
    <div className="deploy-flow-card">
      <div className="flex items-center gap-3">
        <div className="metric-icon tone-cyan"><Icon size={16} /></div>
        <div>
          <div className="label">{title}</div>
          <div className="mt-1 text-lg font-black text-white">{value}</div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}
