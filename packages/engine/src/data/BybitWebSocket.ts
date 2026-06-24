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
  private heartbeat?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;
  private pongDeadline: NodeJS.Timeout | undefined;
  private staleMessages = 0;
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
    const url = this.testnet
      ? "wss://stream-testnet.bybit.com/v5/public/linear"
      : "wss://stream.bybit.com/v5/public/linear";
    this.socket = new WebSocket(url);
    this.socket.on("open", () => {
      this.reconnectAttempts = 0;
      this.subscribe();
      this.heartbeat = setInterval(() => {
        this.socket?.send(JSON.stringify({ op: "ping" }));
        if (this.pongDeadline) clearTimeout(this.pongDeadline);
        this.pongDeadline = setTimeout(() => {
          log.warn("pong timeout");
          this.socket?.terminate();
        }, 5_000);
      }, 20_000);
      log.info({ url, topics: this.topics }, "connected");
    });
    this.socket.on("message", (raw) => this.handleMessage(raw.toString()));
    this.socket.on("error", (error) => log.error({ error }, "socket error"));
    this.socket.on("close", () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (!this.intentionallyClosed) this.reconnect();
    });
  }

  close(): void {
    this.intentionallyClosed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pongDeadline) clearTimeout(this.pongDeadline);
    this.socket?.close();
  }

  private subscribe(): void {
    for (let index = 0; index < this.topics.length; index += 10) {
      this.socket?.send(JSON.stringify({ op: "subscribe", args: this.topics.slice(index, index + 10) }));
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= 5) {
      log.error({ attempts: this.reconnectAttempts }, "reconnect exhausted");
      this.emit("fatal_disconnect");
      return;
    }
    const delay = 1_000 * 2 ** this.reconnectAttempts++;
    log.warn({ delay }, "reconnecting");
    this.emit("reconnect", this.reconnectAttempts);
    setTimeout(() => this.connect(), delay);
  }

  private handleMessage(raw: string): void {
    try {
      const message = envelopeSchema.parse(JSON.parse(raw));
      if (message.op === "pong") {
        if (this.pongDeadline) clearTimeout(this.pongDeadline);
        this.pongDeadline = undefined;
        return;
      }
      if (message.ts) {
        const latencyMs = Date.now() - message.ts;
        if (latencyMs > 200 && Date.now() - this.lastLatencyWarning > 60_000) {
          this.lastLatencyWarning = Date.now();
          log.warn({ latencyMs, topic: message.topic }, "high market-data latency");
        }
        this.staleMessages = latencyMs > 1_000 ? this.staleMessages + 1 : 0;
        if (this.staleMessages >= 5) {
          log.warn({ latencyMs }, "persistent stale market data; reconnecting");
          this.staleMessages = 0;
          this.socket?.terminate();
          return;
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
}
