import { spawn } from "node:child_process";

const processes = [
  spawn(process.execPath, ["packages/api/dist/index.js"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn(process.execPath, ["packages/engine/dist/main.js"], {
    stdio: "inherit",
    env: process.env,
  }),
];

let shuttingDown = false;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
  setTimeout(() => process.exit(exitCode), 30_000).unref();
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      if (processes.every((process) => process.exitCode !== null || process.signalCode !== null)) {
        process.exit(0);
      }
      return;
    }
    process.stderr.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      module: "production-launcher",
      message: "Obsidra child process exited unexpectedly",
      context: { code, signal },
    })}\n`);
    shutdown("SIGTERM", code ?? 1);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
