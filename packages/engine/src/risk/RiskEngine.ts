import { prisma, type Direction, type SignalResult } from "@obsidra/shared";
import type { BybitRestClient } from "../data/BybitRestClient.js";
import type { AdaptiveParams } from "../signals/AdaptiveParams.js";
import { DailyLossGuard } from "./DailyLossGuard.js";
import { calculatePositionSize } from "./PositionSizer.js";
import type { PreFlightCheck } from "./PreFlightCheck.js";

export interface RiskDecision {
  approved: boolean;
  reason?: string;
  positionSizeUsdt: number;
  leverage: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopPct: number;
}

export class RiskEngine {
  private readonly dailyLossGuard: DailyLossGuard;

  constructor(
    dailyLossLimit: number,
    private readonly maxDrawdownPct: number,
    private readonly maxPositionUsdt: number,
    private readonly preflight: PreFlightCheck,
    private readonly client: BybitRestClient,
    private readonly adaptive: AdaptiveParams,
  ) {
    this.dailyLossGuard = new DailyLossGuard(dailyLossLimit);
  }

  async approve(symbol: string, signal: SignalResult): Promise<RiskDecision> {
    const reject = (reason: string): RiskDecision => ({
      approved: false,
      reason,
      positionSizeUsdt: 0,
      leverage: 1,
      stopLossPrice: signal.stopLoss,
      takeProfitPrice: signal.takeProfit,
      trailingStopPct: this.adaptive.snapshot.config.trailingStopPct,
    });
    const daily = await this.dailyLossGuard.check();
    if (!daily.allowed) return reject(`Daily loss limit reached: ${daily.realizedPnl.toFixed(2)} USDT`);
    const equity = await this.client.getWalletEquity();
    const metrics = await prisma.dailyMetrics.findMany({ orderBy: { date: "desc" }, take: 30 });
    const peak = Math.max(equity, ...metrics.map((item) => item.equityEnd));
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (drawdown > this.maxDrawdownPct) return reject(`Maximum drawdown exceeded: ${drawdown.toFixed(2)}%`);
    const preflight = await this.preflight.run(symbol);
    if (!preflight.allowed) return reject(preflight.reason ?? "Pre-flight rejected");
    const trades = await prisma.trade.findMany({
      where: { pnlUsdt: { not: null } },
      orderBy: { closedAt: "desc" },
      take: 50,
      select: { pnlUsdt: true },
    });
    const { config } = this.adaptive.snapshot;
    const positionSizeUsdt = calculatePositionSize(equity, trades, this.maxPositionUsdt, config.maxPositionPct);
    if (positionSizeUsdt <= 0) return reject("Position sizing returned zero");
    const atrValue = signal.indicators.atr ?? 0;
    const atrLeverage = atrValue > 0 ? 0.02 / (atrValue / signal.entryPrice) : 1;
    const leverage = Math.max(1, Math.min(config.leverageMax, Math.floor(atrLeverage)));
    return {
      approved: true,
      positionSizeUsdt,
      leverage,
      stopLossPrice: signal.stopLoss,
      takeProfitPrice: signal.takeProfit,
      trailingStopPct: config.trailingStopPct,
    };
  }
}

export function sideFor(direction: Direction): "Buy" | "Sell" {
  return direction === "LONG" ? "Buy" : "Sell";
}
