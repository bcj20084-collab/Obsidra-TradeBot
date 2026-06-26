import { spawn } from "node:child_process";

const childConfigs = [
  { name: "api", entrypoint: "packages/api/dist/index.js" },
  { name: "engine", entrypoint: "packages/engine/dist/main.js" },
];

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function premiumLog(level, event, message, context = {}) {
  const stream = level === "fatal" || level === "error" ? process.stderr : process.stdout;
  const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
  const detail = context.name ? ` | ${cleanText(context.name)}` : "";
  stream.write(`${timestamp} | ${level.toUpperCase().padEnd(7)} | launcher | ${cleanText(message || event)}${detail}\n`);
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
