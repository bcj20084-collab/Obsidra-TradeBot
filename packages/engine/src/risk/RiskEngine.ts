import { operatorLog, premiumLog, prisma, type Direction, type SignalResult } from "@obsidra/shared";
import type { IExchangeAdapter } from "../exchanges/IExchangeAdapter.js";
import type { AdaptiveParams } from "../signals/AdaptiveParams.js";
import { DailyLossGuard } from "./DailyLossGuard.js";
import { calculatePositionSize, capPositionByStopRisk } from "./PositionSizer.js";
import type { PreFlightCheck } from "./PreFlightCheck.js";

export interface RiskDecision {
  approved: boolean;
  reason?: string;
  positionSizeUsdt: number;
  leverage: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopPct: number;
  riskRewardRatio?: number;
}

export class RiskEngine {
  private readonly dailyLossGuard: DailyLossGuard;

  constructor(
    dailyLossLimit: number,
    weeklyLossLimit: number,
    private readonly maxDrawdownPct: number,
    private readonly maxPositionUsdt: number,
    private readonly preflight: PreFlightCheck,
    private readonly adapter: IExchangeAdapter,
    private readonly adaptive: AdaptiveParams,
    private readonly maxRiskPerTradePct = 0.5,
    private readonly maxConsecutiveLosses = 3,
    private readonly lossCooldownMinutes = 240,
  ) {
    this.dailyLossGuard = new DailyLossGuard(dailyLossLimit, weeklyLossLimit);
  }

  async approve(symbol: string, signal: SignalResult): Promise<RiskDecision> {
    const reject = (reason: string): RiskDecision => {
      const decision = {
        approved: false,
        reason,
        positionSizeUsdt: 0,
        leverage: 1,
        stopLossPrice: signal.stopLoss,
        takeProfitPrice: signal.takeProfit,
        trailingStopPct: this.adaptive.snapshot.config.trailingStopPct,
        riskRewardRatio: 0,
      };
      premiumLog("risk", "risk_rejected", {
        symbol,
        exchange: this.adapter.exchangeId,
        direction: signal.direction,
        score: signal.score,
        confidence: signal.confidence,
        regime: signal.regime,
        reason,
      }, "info", "premium risk rejected");
      operatorLog("WARNING", `🛡️ RISK REJECTED | ${symbol}`, reason);
      return decision;
    };
    const daily = await this.dailyLossGuard.check();
    if (!daily.allowed) return reject(`Daily loss limit reached: ${daily.realizedPnl.toFixed(2)} USDT`);
    const equity = await this.adapter.getWalletBalance();
    const metrics = await prisma.dailyMetrics.findMany({ orderBy: { date: "desc" }, take: 30 });
    const peak = Math.max(equity, ...metrics.map((item) => item.equityEnd));
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (drawdown > this.maxDrawdownPct) return reject(`Maximum drawdown exceeded: ${drawdown.toFixed(2)}%`);
    const preflight = await this.preflight.run(symbol);
    if (!preflight.allowed) return reject(preflight.reason ?? "Pre-flight rejected");
    const trades = await prisma.trade.findMany({
      where: { exchange: this.adapter.exchangeId, pnlUsdt: { not: null } },
      orderBy: { closedAt: "desc" },
      take: 50,
      select: { pnlUsdt: true, closedAt: true },
    });
    const recentLosses = trades.findIndex((trade) => (trade.pnlUsdt ?? 0) >= 0);
    const lossStreak = recentLosses === -1 ? trades.length : recentLosses;
    const lastClosedAt = trades[0]?.closedAt;
    if (lossStreak >= this.maxConsecutiveLosses && lastClosedAt
      && Date.now() - lastClosedAt.getTime() < this.lossCooldownMinutes * 60_000) {
      return reject(`Loss cooldown active after ${lossStreak} consecutive losses`);
    }
    const { config } = this.adaptive.snapshot;
    const basePositionSizeUsdt = calculatePositionSize(equity, trades, this.maxPositionUsdt, config.maxPositionPct);
    const atrValue = signal.indicators.atr ?? 0;
    const atrLeverage = atrValue > 0 ? 0.02 / (atrValue / signal.entryPrice) : 1;
    const leverage = Math.max(1, Math.min(config.leverageMax, Math.floor(atrLeverage)));
    const positionSizeUsdt = capPositionByStopRisk(
      basePositionSizeUsdt,
      equity,
      signal.entryPrice,
      signal.stopLoss,
      leverage,
      this.maxRiskPerTradePct,
    );
    if (positionSizeUsdt <= 0) return reject("Position sizing returned zero");
    const riskDistance = Math.abs(signal.entryPrice - signal.stopLoss);
    const rewardDistance = Math.abs(signal.takeProfit - signal.entryPrice);
    const riskRewardRatio = rewardDistance / Math.max(riskDistance, Number.EPSILON);
    if (riskRewardRatio < 1.5) return reject(`Risk/reward ${riskRewardRatio.toFixed(2)} is below 1.5`);
    const decision = {
      approved: true,
      positionSizeUsdt,
      leverage,
      stopLossPrice: signal.stopLoss,
      takeProfitPrice: signal.takeProfit,
      trailingStopPct: config.trailingStopPct,
      riskRewardRatio,
    };
    premiumLog("risk", "risk_approved", {
      symbol,
      exchange: this.adapter.exchangeId,
      direction: signal.direction,
      score: signal.score,
      confidence: signal.confidence,
      regime: signal.regime,
      equity,
      drawdownPct: drawdown,
      positionSizeUsdt,
      leverage,
      riskRewardRatio,
    }, "info", "premium risk approved");
    operatorLog(
      "INFO",
      `🛡️ RISK APPROVED | ${symbol}`,
      `Size: ${positionSizeUsdt.toFixed(2)} USDT | Leverage: ${leverage}x | R:R ${riskRewardRatio.toFixed(2)}`,
    );
    return decision;
  }
}

export function sideFor(direction: Direction): "Buy" | "Sell" {
  return direction === "LONG" ? "Buy" : "Sell";
}
