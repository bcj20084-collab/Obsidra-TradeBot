import { randomUUID } from "node:crypto";
import { prisma, type SignalResult } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";
import type { ExchangeRouter } from "../exchanges/ExchangeRouter.js";
import type { RiskDecision } from "../risk/RiskEngine.js";
import { sideFor } from "../risk/RiskEngine.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";
import type { OrderStateMachine } from "./OrderStateMachine.js";

export class OrderManager {
  constructor(
    private readonly exchanges: ExchangeRouter,
    private readonly stateMachine: OrderStateMachine,
    private readonly journal: ExecutionJournal,
  ) {}

  async execute(symbol: string, signal: SignalResult, risk: RiskDecision, exchange: ExchangeId = "bybit", strategyId = "trend"): Promise<string> {
    if (!risk.approved) throw new Error("OrderManager requires RiskEngine approval");
    const clientOrderId = `obs-${randomUUID()}`.slice(0, 36);
    const signalData = {
      indicators: signal.indicators,
      mlFeatures: signal.mlFeatures ?? {},
      trendScore: signal.trendScore ?? 0,
      entryScore: signal.entryScore ?? 0,
      confidence: signal.confidence,
      timestamp: signal.timestamp ?? Date.now(),
    };
    const trade = await prisma.trade.create({
      data: {
        clientOrderId,
        symbol,
        exchange,
        strategyId,
        direction: signal.direction,
        status: "PENDING",
        stopLoss: risk.stopLossPrice,
        takeProfit: risk.takeProfitPrice,
        positionSizeUsdt: risk.positionSizeUsdt,
        leverage: risk.leverage,
        signalScore: signal.score,
        signalData,
        mlScore: signal.mlAdjustment,
        marketRegime: signal.regime,
      },
    });
    await this.journal.record("ORDER_INTENT", { signal, risk, clientOrderId }, trade.id);
    await this.stateMachine.transition(trade.id, "SUBMITTED", `Write-ahead transition before ${exchange} API`);
    try {
      const quantity = Number((risk.positionSizeUsdt / signal.entryPrice).toFixed(6));
      const result = await this.exchanges.placeOrder(exchange, {
        symbol,
        side: sideFor(signal.direction),
        orderType: "Market",
        qty: quantity,
        stopLoss: risk.stopLossPrice,
        takeProfit: risk.takeProfitPrice,
        clientOrderId,
      });
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          exchangeOrderId: result.exchangeOrderId,
          ...(exchange === "bybit" ? { bybitOrderId: result.exchangeOrderId } : {}),
          entryPrice: result.avgFillPrice || signal.entryPrice,
          feeUsdt: result.feeUsdt,
          openedAt: new Date(),
        },
      });
      await this.stateMachine.transition(trade.id, "OPEN", result.status === "Filled" ? "Order filled" : "Exchange confirmed");
      await this.journal.record("ORDER_PLACED", { ...result, quantity }, trade.id);
      return trade.id;
    } catch (error) {
      await this.stateMachine.transition(trade.id, "ERROR", "Order placement failed", { error: String(error) });
      throw error;
    }
  }
}
