import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { OHLCVCandle } from "../IExchangeAdapter.js";

interface Events { candle: [string, OHLCVCandle]; ticker: [string, number, number]; fatal: [] }

export class BinanceWebSocket extends EventEmitter<Events> {
  private socket?: WebSocket;
  private attempts = 0;
  private intentionallyClosed = false;
  private readonly symbols = new Set<string>();
  private readonly intervals = new Set<string>();
  constructor(private readonly testnet: boolean) { super(); }
  subscribe(symbols: string[], intervals: string[]): void {
    symbols.forEach((symbol) => this.symbols.add(symbol));
    intervals.forEach((interval) => this.intervals.add(interval));
    this.intentionallyClosed = true;
    this.socket?.removeAllListeners("close");
    this.socket?.terminate();
    this.intentionallyClosed = false;
    this.connect();
  }
  private connect(): void {
    const symbols = [...this.symbols];
    const intervals = [...this.intervals];
    const streams = symbols.flatMap((symbol) => [
      ...intervals.map((interval) => `${symbol.toLowerCase()}@kline_${/^\d+$/.test(interval) ? `${interval}m` : interval}`),
      `${symbol.toLowerCase()}@markPrice@1s`,
    ]);
    if (!streams.length) return;
    const host = this.testnet ? "wss://stream.binancefuture.com" : "wss://fstream.binance.com";
    this.socket = new WebSocket(`${host}/stream?streams=${streams.join("/")}`);
    this.socket.on("open", () => { this.attempts = 0; });
    this.socket.on("ping", (data) => this.socket?.pong(data));
    this.socket.on("message", (raw) => {
      try { this.handle(raw.toString()); } catch { /* Ignore malformed public market-data frames. */ }
    });
    this.socket.on("error", () => { /* The close handler owns bounded reconnection. */ });
    this.socket.on("close", () => { if (!this.intentionallyClosed) this.reconnect(); });
  }
  close(): void { this.intentionallyClosed = true; this.socket?.close(); }
  private handle(raw: string): void {
    const envelope = JSON.parse(raw) as { data?: Record<string, unknown> };
    const data = envelope.data;
    if (!data) return;
    if (data.e === "kline") {
      const k = data.k as Record<string, unknown>;
      this.emit("candle", String(data.s), {
        symbol: String(data.s), interval: String(k.i), openTime: Number(k.t), closeTime: Number(k.T),
        open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v),
        confirmed: Boolean(k.x),
      });
    } else if (data.e === "markPriceUpdate") {
      this.emit("ticker", String(data.s), Number(data.p), Number(data.r));
    }
  }
  private reconnect(): void {
    if (this.attempts >= 5) return void this.emit("fatal");
    setTimeout(() => this.connect(), 1000 * 2 ** this.attempts++);
  }
}
