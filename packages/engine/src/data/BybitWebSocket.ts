import EventEmitter from 'node:events';
import WebSocket from 'ws';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { MarketDataStore, Timeframe } from './MarketDataStore.js';
import { normalizeKline, normalizeOrderbook, normalizeTicker } from './DataNormalizer.js';

const wsEnvelope = z.object({ topic: z.string().optional(), ts: z.number().optional() }).passthrough();

type Events = 'kline' | 'orderbook' | 'ticker' | 'open' | 'close';

export class BybitWebSocket extends EventEmitter {
  private ws?: WebSocket;
  private heartbeat?: NodeJS.Timeout;
  private reconnects = 0;
  private readonly timeframes: Timeframe[] = ['1', '15', '60', '240'];

  constructor(private readonly store: MarketDataStore, private readonly symbol = env.TRADING_SYMBOL) { super(); }

  connect() {
    const host = env.BYBIT_TESTNET ? 'wss://stream-testnet.bybit.com/v5/public/linear' : 'wss://stream.bybit.com/v5/public/linear';
    this.ws = new WebSocket(host);
    this.ws.on('open', () => { this.reconnects = 0; this.subscribe(); this.startHeartbeat(); this.emit('open'); logger.info({ module: 'BybitWebSocket', host }, 'connected'); });
    this.ws.on('message', (buf) => this.handleMessage(buf.toString()));
    this.ws.on('close', () => { this.stopHeartbeat(); this.emit('close'); this.reconnect(); });
    this.ws.on('error', (err) => logger.warn({ module: 'BybitWebSocket', err }, 'websocket error'));
  }

  close() { this.stopHeartbeat(); this.ws?.close(); }

  private subscribe() {
    const args = [
      ...this.timeframes.map((tf) => `kline.${tf}.${this.symbol}`),
      `orderbook.1.${this.symbol}`,
      `tickers.${this.symbol}`,
    ];
    this.ws?.send(JSON.stringify({ op: 'subscribe', args }));
  }

  private startHeartbeat() { this.heartbeat = setInterval(() => this.ws?.send(JSON.stringify({ op: 'ping' })), 20_000); }
  private stopHeartbeat() { if (this.heartbeat) clearInterval(this.heartbeat); }

  private reconnect() {
    if (this.reconnects >= 5) return logger.error({ module: 'BybitWebSocket' }, 'max reconnect attempts reached');
    const delay = 2 ** this.reconnects * 1000;
    this.reconnects += 1;
    setTimeout(() => this.connect(), delay);
  }

  private handleMessage(text: string) {
    const json = JSON.parse(text) as unknown;
    const parsed = wsEnvelope.safeParse(json);
    if (!parsed.success || !parsed.data.topic) return;
    const latency = parsed.data.ts ? Date.now() - parsed.data.ts : 0;
    if (latency > 200) logger.warn({ module: 'BybitWebSocket', latency }, 'high websocket latency');
    const topic = parsed.data.topic;
    if (topic.startsWith('kline.')) {
      const tf = topic.split('.')[1] as Timeframe;
      const normalized = normalizeKline(tf, json);
      if (normalized) { this.store.upsertCandle(normalized.tf, normalized.candle); this.emit('kline', normalized); }
    } else if (topic.startsWith('orderbook.')) {
      const top = normalizeOrderbook(json);
      if (top) { this.store.setOrderbook(top); this.emit('orderbook', top); }
    } else if (topic.startsWith('tickers.')) {
      const ticker = normalizeTicker(json);
      if (ticker) { this.store.setTicker(ticker); this.emit('ticker', ticker); }
    }
  }

  onTyped(event: Events, listener: (...args: any[]) => void) { return this.on(event, listener); }
}
