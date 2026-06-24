import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { getEnv, moduleLogger, prisma } from "@obsidra/shared";
import { createApp } from "./app.js";

const env = getEnv();
const log = moduleLogger("api");
const server = createServer(createApp());
const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", (socket) => {
  const timer = setInterval(async () => {
    if (socket.readyState !== socket.OPEN) return;
    const state = await prisma.botState.findUnique({ where: { id: "singleton" } });
    const latest = await prisma.trade.findFirst({ orderBy: { updatedAt: "desc" } });
    socket.send(JSON.stringify({ type: "snapshot", state, latestTrade: latest, timestamp: Date.now() }));
  }, 2_000);
  socket.on("close", () => clearInterval(timer));
});

server.listen(env.PORT, () => log.info({ port: env.PORT }, "API listening"));
