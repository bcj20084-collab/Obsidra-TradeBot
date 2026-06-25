import { createServer, type Server } from "node:http";
import { premiumLog, type LiveMetrics } from "@obsidra/shared";

export function startHealthServer(port: number, metrics: () => LiveMetrics | undefined): Server {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    const current = metrics();
    const healthy = current?.botStatus !== "ERROR";
    if (!healthy) {
      premiumLog("health", "health_check_unhealthy", {
        port,
        status: current?.botStatus ?? "UNKNOWN",
        totalPnlUsdt: current?.totalPnlUsdt ?? null,
        openPositionsCount: current?.openPositionsCount ?? null,
      }, "warn", "premium health check unhealthy");
    }
    response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ healthy, metrics: current ?? null }));
  });

  server.on("error", (error) => {
    premiumLog("health", "health_server_error", {
      port,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    }, "error", "premium health server error");
  });

  return server.listen(port, () => {
    premiumLog("health", "health_server_started", { port, path: "/health" }, "info", "premium health server started");
  });
}
