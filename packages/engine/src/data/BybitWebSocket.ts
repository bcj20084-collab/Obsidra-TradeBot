import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { z } from "zod";
import { moduleLogger } from "@obsidra/shared";
import { normalizeKline } from "./DataNormalizer.js";
import type { MarketDataStore, Orderbook, Ticker } from "./MarketDataStore.js";

const log = moduleLogger("BybitWebSocket");
const envelopeSchema = z.object({
  topic: z.string().optional(),
  ts: z.number().optional(),
  data: z.unknown().optional(),
  success: z.boolean().optional(),
  op: z.string().optional(),
  ret_msg: z.string().optional(),
});

interface Events {
  kline: [ReturnType<typeof normalizeKline>];
  tick: [Ticker];
  orderbook: [Orderbook];
  reconnect: [number];
  fatal_disconnect: [];
}

export class BybitWebSocket extends EventEmitter<Events> {
  private socket?: WebSocket;
  private heartbeat: NodeJS.Timeout | undefined;
  private pongDeadline: NodeJS.Timeout | undefined;
  private staleWatchdog: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;
  private lastMessageAt = 0;
  private lastLatencyWarning = 0;
  private readonly topics: string[];

  constructor(
    private readonly store: MarketDataStore,
    private readonly symbols: string[],
    private readonly testnet: boolean,
  ) {
    super();
    this.topics = symbols.flatMap((symbol) => [
      ...["1", "15", "60", "240"].map((tf) => `kline.${tf}.${symbol}`),
      `orderbook.1.${symbol}`,
      `tickers.${symbol}`,
    ]);
  }

  connect(): void {
    this.intentionallyClosed = false;
    this.cleanupTimers();
    this.socket?.removeAllListeners();
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.close();
    const url = this.testnet
      ? "wss://stream-testnet.bybit.com/v5/public/linear"
      : "wss://stream.bybit.com/v5/public/linear";
    this.socket = new WebSocket(url);
    this.socket.on("open", () => {
      this.reconnectAttempts = 0;
      this.lastMessageAt = Date.now();
      this.subscribe();
      this.startHeartbeat();
      this.startStaleWatchdog();
      log.info({ url, topics: this.topics }, "connected");
    });
    this.socket.on("message", (raw) => this.handleMessage(raw.toString()));
    this.socket.on("pong", () => this.clearPongDeadline());
    this.socket.on("error", (error) => log.error({ error }, "socket error"));
    this.socket.on("close", () => {
      this.cleanupTimers();
      if (!this.intentionallyClosed) this.reconnect();
    });
  }

  close(): void {
    this.intentionallyClosed = true;
    this.cleanupTimers();
    this.socket?.close();
  }

  private subscribe(): void {
    for (let index = 0; index < this.topics.length; index += 10) {
      this.sendJson({ op: "subscribe", args: this.topics.slice(index, index + 10) });
    }
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.ping();
        this.sendJson({ op: "ping" });
        if (this.pongDeadline) clearTimeout(this.pongDeadline);
        this.pongDeadline = setTimeout(() => {
          log.warn("pong timeout");
          socket.terminate();
        }, 15_000);
      } catch (error) {
        log.warn({ error }, "heartbeat failed");
        socket.terminate();
      }
    }, 30_000);
  }

  private startStaleWatchdog(): void {
    this.staleWatchdog = setInterval(() => {
      const ageMs = Date.now() - this.lastMessageAt;
      if (ageMs < 120_000) return;
      log.warn({ ageMs }, "market data silent; reconnecting");
      this.socket?.terminate();
    }, 30_000);
  }

  private reconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= 8) {
      log.error({ attempts: this.reconnectAttempts }, "reconnect exhausted");
      this.emit("fatal_disconnect");
      return;
    }
    const delay = Math.min(60_000, 1_000 * 2 ** this.reconnectAttempts++);
    log.warn({ delay }, "reconnecting");
    this.emit("reconnect", this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private handleMessage(raw: string): void {
    try {
      this.lastMessageAt = Date.now();
      const message = envelopeSchema.parse(JSON.parse(raw));
      if (message.op === "pong" || message.ret_msg === "pong" || message.op === "ping") {
        this.clearPongDeadline();
        return;
      }
      if (message.ts) {
        const latencyMs = Math.max(0, Date.now() - message.ts);
        if (latencyMs > 2_000 && Date.now() - this.lastLatencyWarning > 60_000) {
          this.lastLatencyWarning = Date.now();
          log.warn({ latencyMs, topic: message.topic }, "high market-data latency");
        }
      }
      if (!message.topic || !message.data) return;
      const data = Array.isArray(message.data) ? message.data : [message.data];
      const row = data[0] as Record<string, unknown> | undefined;
      if (!row) return;
      if (message.topic.startsWith("kline.")) {
        const [, timeframe, symbol] = message.topic.split(".");
        if (!timeframe || !symbol) return;
        const candle = normalizeKline(symbol, timeframe, row);
        this.store.addCandle(candle);
        this.emit("kline", candle);
      } else if (message.topic.startsWith("tickers.")) {
        const ticker: Ticker = {
          symbol: String(row.symbol ?? message.topic.split(".").at(-1)),
          price: Number(row.lastPrice),
          fundingRate: Number(row.fundingRate ?? 0),
          openInterest: Number(row.openInterest ?? 0),
          timestamp: message.ts ?? Date.now(),
        };
        this.store.setTicker(ticker);
        this.emit("tick", ticker);
      } else if (message.topic.startsWith("orderbook.")) {
        const bids = row.b as Array<[string, string]> | undefined;
        const asks = row.a as Array<[string, string]> | undefined;
        if (!bids?.[0] || !asks?.[0]) return;
        const orderbook: Orderbook = {
          symbol: String(row.s ?? message.topic.split(".").at(-1)),
          bid: Number(bids[0][0]),
          ask: Number(asks[0][0]),
          timestamp: message.ts ?? Date.now(),
        };
        this.store.setOrderbook(orderbook);
        this.emit("orderbook", orderbook);
      }
    } catch (error) {
      log.warn({ error, raw: raw.slice(0, 500) }, "invalid websocket message");
    }
  }

  private sendJson(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private clearPongDeadline(): void {
    if (this.pongDeadline) clearTimeout(this.pongDeadline);
    this.pongDeadline = undefined;
  }

  private cleanupTimers(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pongDeadline) clearTimeout(this.pongDeadline);
    if (this.staleWatchdog) clearInterval(this.staleWatchdog);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeat = undefined;
    this.pongDeadline = undefined;
    this.staleWatchdog = undefined;
    this.reconnectTimer = undefined;
  }
}
