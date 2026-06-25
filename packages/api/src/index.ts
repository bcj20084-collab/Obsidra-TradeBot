import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { getEnv, moduleLogger, prisma } from "@obsidra/shared";
import { createApp } from "./app.js";

const env = getEnv();
const log = moduleLogger("api");
const server = createServer(createApp());
const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", (socket) => {
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
    }).finally(() => {
      sending = false;
    });
  }, 2_000);
  socket.on("close", () => clearInterval(timer));
});

server.listen(env.PORT, () => log.info({ port: env.PORT }, "API listening"));
