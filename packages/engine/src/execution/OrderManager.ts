import { randomUUID } from "node:crypto";
import { prisma, type SignalResult } from "@obsidra/shared";
import type { BybitRestClient } from "../data/BybitRestClient.js";
import type { RiskDecision } from "../risk/RiskEngine.js";
import { sideFor } from "../risk/RiskEngine.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";
import type { OrderStateMachine } from "./OrderStateMachine.js";

export class OrderManager {
  constructor(
    private readonly client: BybitRestClient,
    private readonly stateMachine: OrderStateMachine,
    private readonly journal: ExecutionJournal,
  ) {}

  async execute(symbol: string, signal: SignalResult, risk: RiskDecision): Promise<string> {
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
    await this.stateMachine.transition(trade.id, "SUBMITTED", "Write-ahead transition before Bybit API");
    try {
      const quantity = (risk.positionSizeUsdt / signal.entryPrice).toFixed(6);
      const result = await this.client.placeOrder({
        symbol,
        side: sideFor(signal.direction),
        qty: quantity,
        stopLoss: risk.stopLossPrice.toFixed(2),
        takeProfit: risk.takeProfitPrice.toFixed(2),
        clientOrderId,
      });
      await prisma.trade.update({
        where: { id: trade.id },
        data: { bybitOrderId: result.orderId, entryPrice: signal.entryPrice, openedAt: new Date() },
      });
      await this.stateMachine.transition(trade.id, "OPEN", result.paper ? "Paper order opened" : "Exchange confirmed");
      await this.journal.record("ORDER_PLACED", { ...result, quantity }, trade.id);
      return trade.id;
    } catch (error) {
      await this.stateMachine.transition(trade.id, "ERROR", "Order placement failed", { error: String(error) });
      throw error;
    }
  }
}
