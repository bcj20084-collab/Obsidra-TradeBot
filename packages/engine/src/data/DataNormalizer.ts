import { z } from 'zod';
import type { Candle, OrderbookTop, Ticker, Timeframe } from './MarketDataStore.js';

const klineItem = z.object({ start: z.union([z.string(), z.number()]), open: z.string(), high: z.string(), low: z.string(), close: z.string(), volume: z.string(), confirm: z.boolean().optional() });
const orderbookMsg = z.object({ ts: z.number(), data: z.object({ b: z.array(z.tuple([z.string(), z.string()])), a: z.array(z.tuple([z.string(), z.string()])) }) });
const tickerMsg = z.object({ ts: z.number().optional(), data: z.object({ symbol: z.string(), lastPrice: z.string(), fundingRate: z.string().optional(), openInterest: z.string().optional() }) });

export function normalizeKline(tf: Timeframe, raw: unknown): { tf: Timeframe; candle: Candle } | null {
  const msg = z.object({ data: z.array(klineItem) }).safeParse(raw);
  if (!msg.success || !msg.data.data[0]) return null;
  const k = msg.data.data[0];
  return { tf, candle: { start: Number(k.start), open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close), volume: Number(k.volume), confirm: Boolean(k.confirm) } };
}

export function normalizeOrderbook(raw: unknown): OrderbookTop | null {
  const parsed = orderbookMsg.safeParse(raw);
  if (!parsed.success) return null;
  const bid = Number(parsed.data.data.b[0]?.[0]);
  const ask = Number(parsed.data.data.a[0]?.[0]);
  return Number.isFinite(bid) && Number.isFinite(ask) ? { bid, ask, ts: parsed.data.ts } : null;
}

export function normalizeTicker(raw: unknown): Ticker | null {
  const parsed = tickerMsg.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data.data;
  return { symbol: data.symbol, price: Number(data.lastPrice), fundingRate: Number(data.fundingRate ?? 0), openInterest: data.openInterest ? Number(data.openInterest) : undefined, ts: parsed.data.ts ?? Date.now() };
}
