import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { getEnv, moduleLogger, premiumLog, prisma } from "@obsidra/shared";
import { createApp } from "./app.js";

const env = getEnv();
const log = moduleLogger("api");
const server = createServer(createApp());
const wss = new WebSocketServer({ server, path: "/live" });
let liveConnections = 0;

function heartbeatSeconds(): number {
  const parsed = Number.parseInt(process.env.PREMIUM_LOG_HEARTBEAT_SECONDS ?? "300", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return String(error);
}

function apiPremiumContext() {
  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    websocketPath: "/live",
    liveConnections,
    publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN ?? "",
    serviceName: process.env.RAILWAY_SERVICE_NAME ?? "",
  };
}

function startPremiumHeartbeat(): void {
  const seconds = heartbeatSeconds();
  if (seconds <= 0) return;
  premiumLog("api", "api_heartbeat_configured", { ...apiPremiumContext(), intervalSeconds: seconds }, "info", "API heartbeat configured");
  const timer = setInterval(() => {
    premiumLog("api", "api_heartbeat", apiPremiumContext(), "info", "API online");
  }, seconds * 1_000);
  timer.unref();
}

wss.on("connection", (socket) => {
  liveConnections += 1;
  premiumLog("api", "websocket_connected", { liveConnections }, "info", "premium websocket connected");

  let sending = false;
  const timer = setInterval(() => {
    if (sending || socket.readyState !== socket.OPEN) return;
    sending = true;
    void Promise.all([
      prisma.botState.findUnique({ where: { id: "singleton" } }),
      prisma.trade.findFirst({ orderBy: { updatedAt: "desc" } }),
    ]).then(([state, latestTrade]) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "snapshot", state, latestTrade, timestamp: Date.now() }));
      }
    }).catch((error) => {
      log.warn({ error }, "live snapshot failed");
      premiumLog("api", "live_snapshot_failed", { error: serializeError(error), liveConnections }, "warn", "premium live snapshot failed");
    }).finally(() => {
      sending = false;
    });
  }, 2_000);

  socket.on("error", (error) => {
    premiumLog("api", "websocket_error", { error: serializeError(error), liveConnections }, "warn", "premium websocket error");
  });

  socket.on("close", (code, reason) => {
    liveConnections = Math.max(0, liveConnections - 1);
    premiumLog("api", "websocket_disconnected", {
      code,
      reason: reason.toString(),
      liveConnections,
    }, "info", "premium websocket disconnected");
    clearInterval(timer);
  });
});

server.on("error", (error) => {
  premiumLog("api", "api_server_error", { error: serializeError(error), ...apiPremiumContext() }, "error", "premium api server error");
});

server.listen(env.PORT, () => {
  log.info({ port: env.PORT }, "API listening");
  premiumLog("api", "api_started", apiPremiumContext(), "info", "premium api started");
  startPremiumHeartbeat();
});
