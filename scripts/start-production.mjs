import { spawn } from "node:child_process";

const startedAt = Date.now();
const childConfigs = [
  { name: "api", entrypoint: "packages/api/dist/index.js" },
  { name: "engine", entrypoint: "packages/engine/dist/main.js" },
];

function compactStrings(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value && value.length > 0));
}

function railwayContext() {
  return compactStrings({
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
    environmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
    projectId: process.env.RAILWAY_PROJECT_ID,
    publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
    serviceId: process.env.RAILWAY_SERVICE_ID,
    serviceName: process.env.RAILWAY_SERVICE_NAME,
    staticUrl: process.env.RAILWAY_STATIC_URL,
  });
}

function premiumLog(level, event, message, context = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    app: "obsidra-tradebot",
    service: "obsidra",
    module: "production-launcher",
    premium: true,
    logTier: "premium",
    marker: "OBSIDRA_PREMIUM_LOG",
    event,
    message,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1_000),
    railway: railwayContext(),
    context,
  };
  const stream = level === "fatal" || level === "error" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(payload)}\n`);
}

premiumLog("info", "launcher_starting", "Premium production launcher starting", {
  nodeVersion: process.version,
  pid: process.pid,
  children: childConfigs,
});

const processes = childConfigs.map((config) => {
  const child = spawn(process.execPath, [config.entrypoint], {
    stdio: "inherit",
    env: process.env,
  });

  premiumLog("info", "child_spawned", `Premium child spawned: ${config.name}`, {
    name: config.name,
    entrypoint: config.entrypoint,
    pid: child.pid,
  });

  child.on("error", (error) => {
    premiumLog("error", "child_spawn_failed", `Premium child spawn failed: ${config.name}`, {
      name: config.name,
      entrypoint: config.entrypoint,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    });
  });

  return { ...config, child };
});

let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  premiumLog("warn", "launcher_shutdown_requested", "Premium launcher shutdown requested", { signal, exitCode });
  for (const { child, name } of processes) {
    if (!child.killed) {
      premiumLog("warn", "child_kill_requested", `Premium child kill requested: ${name}`, { name, pid: child.pid, signal });
      child.kill(signal);
    }
  }
  setTimeout(() => process.exit(exitCode), 30_000).unref();
}

for (const processInfo of processes) {
  processInfo.child.on("exit", (code, signal) => {
    if (shuttingDown) {
      premiumLog("info", "child_stopped", `Premium child stopped: ${processInfo.name}`, {
        name: processInfo.name,
        code,
        signal,
      });
      if (processes.every(({ child }) => child.exitCode !== null || child.signalCode !== null)) {
        process.exit(0);
      }
      return;
    }
    premiumLog("error", "child_exit_unexpected", "Obsidra child process exited unexpectedly", {
      name: processInfo.name,
      code,
      signal,
    });
    shutdown("SIGTERM", code ?? 1);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
