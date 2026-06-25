import type { Direction } from "@obsidra/shared";
import type { MarketDataStore } from "../../data/MarketDataStore.js";
import { ema, rsi } from "../../indicators/index.js";

export interface ScalpSignal {
  direction: Direction;
  entryPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
  rsi: number;
}

export class ScalpSignalEngine {
  evaluate(symbol: string, store: MarketDataStore): ScalpSignal | null {
    const oneMinute = store.getCandles(symbol, "1");
    const threeMinute = store.getCandles(symbol, "3");
    if (oneMinute.length < 30 || threeMinute.length < 30) return null;
    const rsiValue = rsi(oneMinute.map((candle) => candle.close), 7).at(-1) ?? 50;
    const fast = ema(threeMinute.map((candle) => candle.close), 9);
    const slow = ema(threeMinute.map((candle) => candle.close), 21);
    if (fast.length < 4 || slow.length < 4) return null;
    const alignment = Math.min(fast.length, slow.length);
    const fastTail = fast.slice(-alignment);
    const slowTail = slow.slice(-alignment);
    let crossedLong = false;
    let crossedShort = false;
    for (let offset = Math.max(1, alignment - 3); offset < alignment; offset++) {
      crossedLong ||= fastTail[offset - 1]! <= slowTail[offset - 1]! && fastTail[offset]! > slowTail[offset]!;
      crossedShort ||= fastTail[offset - 1]! >= slowTail[offset - 1]! && fastTail[offset]! < slowTail[offset]!;
    }
    const current = oneMinute.at(-1)!;
    const previous = oneMinute.slice(-21, -1);
    const averageVolume = previous.reduce((sum, candle) => sum + candle.volume, 0) / Math.max(1, previous.length);
    if (current.volume <= averageVolume * 1.5) return null;
    if (rsiValue < 30 && crossedLong) return { direction: "LONG", entryPrice: current.close, stopLossPct: 0.5, takeProfitPct: 1, rsi: rsiValue };
    if (rsiValue > 70 && crossedShort) return { direction: "SHORT", entryPrice: current.close, stopLossPct: 0.5, takeProfitPct: 1, rsi: rsiValue };
    return null;
  }
}
