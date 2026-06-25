import type { Direction } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";
import type { StrategyType } from "./IStrategy.js";

interface ActivePosition { strategyId: string; type: StrategyType; direction: Direction; sizeUsdt: number }
export class StrategyCoordinator {
  private readonly active = new Map<string, ActivePosition[]>();
  constructor(private readonly allowHedge: boolean, private readonly perSymbolLimit: number) {}
  check(exchange: ExchangeId, symbol: string, type: StrategyType, direction: Direction, sizeUsdt: number, strategyId = type.toLowerCase()): { approved: boolean; reason?: string } {
    const positions = this.active.get(`${exchange}:${symbol}`) ?? [];
    if (positions.some((p) => p.type === "GRID" && p.strategyId !== strategyId) || (type === "GRID" && positions.some((p) => p.strategyId !== strategyId))) return { approved: false, reason: "Grid strategy is exclusive on symbol/exchange" };
    if ((type === "SCALP" && positions.some((p) => p.type === "TREND")) || (type === "TREND" && positions.some((p) => p.type === "SCALP"))) return { approved: false, reason: "Scalp and Trend cannot overlap" };
    if (!this.allowHedge && positions.some((p) => p.direction !== direction)) return { approved: false, reason: "Opposing position requires hedge permission" };
    if (positions.reduce((sum, p) => sum + p.sizeUsdt, 0) + sizeUsdt > this.perSymbolLimit) return { approved: false, reason: "Per-symbol exposure limit reached" };
    if (type === "DCA" && positions.some((p) => p.type === "TREND" && p.direction !== direction)) return { approved: false, reason: "DCA and Trend directions conflict" };
    return { approved: true };
  }
  open(exchange: ExchangeId, symbol: string, position: ActivePosition): void {
    const key = `${exchange}:${symbol}`; this.active.set(key, [...(this.active.get(key) ?? []), position]);
  }
  close(exchange: ExchangeId, symbol: string, strategyId: string): void {
    const key = `${exchange}:${symbol}`; this.active.set(key, (this.active.get(key) ?? []).filter((p) => p.strategyId !== strategyId));
  }
}
