import { createServer, type Server } from "node:http";
import type { LiveMetrics } from "@obsidra/shared";

export function startHealthServer(port: number, metrics: () => LiveMetrics | undefined): Server {
  return createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    const current = metrics();
    const healthy = current?.botStatus !== "ERROR";
    response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ healthy, metrics: current ?? null }));
  }).listen(port);
}
