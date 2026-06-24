import type { Candle } from "@obsidra/shared";

export function normalizeKline(symbol: string, timeframe: string, row: Record<string, unknown>): Candle {
  return {
    symbol,
    timeframe,
    openTime: Number(row.start),
    closeTime: Number(row.end),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    confirmed: Boolean(row.confirm),
  };
}
