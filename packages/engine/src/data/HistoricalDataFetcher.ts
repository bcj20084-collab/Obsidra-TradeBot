import { EventEmitter } from "node:events";
import { prisma, type Candle } from "@obsidra/shared";
import type { BybitRestClient } from "./BybitRestClient.js";

interface FetchEvents {
  progress: [{ symbol: string; interval: string; pct: number; candleCount: number; eta: number }];
}

export class HistoricalDataFetcher extends EventEmitter<FetchEvents> {
  constructor(private readonly client: BybitRestClient) {
    super();
  }

  async *fetchRange(symbol: string, interval: string, startMs: number, endMs: number): AsyncGenerator<Candle[]> {
    let cursor = startMs;
    let fetched = 0;
    const intervalMs = interval === "D" ? 86_400_000 : Number(interval) * 60_000;
    const total = Math.max(1, Math.ceil((endMs - startMs) / intervalMs));
    while (cursor < endMs) {
      const existing = await prisma.historicalCandle.findMany({
        where: { symbol, interval, openTime: { gte: BigInt(cursor), lte: BigInt(endMs) } },
        orderBy: { openTime: "asc" },
        take: 1000,
      });
      const candles = existing.length
        ? existing.map((row) => ({ symbol, timeframe: interval, openTime: Number(row.openTime), closeTime: Number(row.openTime) + intervalMs, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume, confirmed: true }))
        : await this.client.getKlines(symbol, interval, 1000, cursor, endMs);
      if (!candles.length) break;
      if (!existing.length) {
        await Promise.all(candles.map((candle) => prisma.historicalCandle.upsert({
          where: { symbol_interval_openTime: { symbol, interval, openTime: BigInt(candle.openTime) } },
          create: { symbol, interval, openTime: BigInt(candle.openTime), open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume, turnover: Number((candle as Candle & { turnover?: number }).turnover ?? 0) },
          update: {},
        })));
      }
      fetched += candles.length;
      cursor = candles.at(-1)!.openTime + intervalMs;
      const pct = Math.min(100, (fetched / total) * 100);
      this.emit("progress", { symbol, interval, pct, candleCount: fetched, eta: pct ? Math.round((100 - pct) * 1000) : 0 });
      yield candles;
    }
  }
}
