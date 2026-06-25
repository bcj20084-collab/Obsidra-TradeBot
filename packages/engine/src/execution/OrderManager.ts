import { randomUUID } from "node:crypto";
import { premiumLog, prisma, type SignalResult } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";
import type { ExchangeRouter } from "../exchanges/ExchangeRouter.js";
import type { RiskDecision } from "../risk/RiskEngine.js";
import { sideFor } from "../risk/RiskEngine.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";
import type { OrderStateMachine } from "./OrderStateMachine.js";
import { calculateOrderQuantity } from "./ExecutionMath.js";

function serializeError(error: unknown): unknown {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return String(error);
}

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
        executionMode: this.exchanges.get(exchange).paperTrading ? "PAPER" : "LIVE",
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
    premiumLog("execution", "order_intent_created", {
      tradeId: trade.id,
      symbol,
      exchange,
      strategyId,
      direction: signal.direction,
      score: signal.score,
      confidence: signal.confidence,
      regime: signal.regime,
      positionSizeUsdt: risk.positionSizeUsdt,
      leverage: risk.leverage,
      stopLoss: risk.stopLossPrice,
      takeProfit: risk.takeProfitPrice,
    }, "info", "premium order intent created");
    await this.journal.record("ORDER_INTENT", { signal, risk, clientOrderId }, trade.id);
    await this.stateMachine.transition(trade.id, "SUBMITTED", `Write-ahead transition before ${exchange} API`);
    try {
      const quantity = calculateOrderQuantity(risk.positionSizeUsdt, risk.leverage, signal.entryPrice);
      premiumLog("execution", "order_submitting", {
        tradeId: trade.id,
        symbol,
        exchange,
        strategyId,
        direction: signal.direction,
        quantity,
        leverage: risk.leverage,
      }, "info", "premium order submitting");
      await this.exchanges.get(exchange).setLeverage(symbol, risk.leverage);
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
      premiumLog("execution", "order_opened", {
        tradeId: trade.id,
        symbol,
        exchange,
        strategyId,
        exchangeOrderId: result.exchangeOrderId,
        status: result.status,
        avgFillPrice: result.avgFillPrice,
        feeUsdt: result.feeUsdt,
        quantity,
      }, "info", "premium order opened");
      return trade.id;
    } catch (error) {
      await this.stateMachine.transition(trade.id, "ERROR", "Order placement failed", { error: String(error) });
      premiumLog("execution", "order_failed", {
        tradeId: trade.id,
        symbol,
        exchange,
        strategyId,
        error: serializeError(error),
      }, "error", "premium order failed");
      throw error;
    }
  }

  async close(tradeId: string, reason: string): Promise<void> {
    const trade = await prisma.trade.findUniqueOrThrow({ where: { id: tradeId } });
    if (!["OPEN", "FILLED", "PARTIALLY_FILLED"].includes(trade.status) || !trade.entryPrice) return;
    premiumLog("execution", "close_intent_created", {
      tradeId: trade.id,
      symbol: trade.symbol,
      exchange: trade.exchange,
      strategyId: trade.strategyId,
      direction: trade.direction,
      reason,
      entryPrice: trade.entryPrice,
      positionSizeUsdt: trade.positionSizeUsdt,
      leverage: trade.leverage,
    }, "info", "premium close intent created");
    await this.stateMachine.transition(trade.id, "CLOSING", reason);
    try {
      const exchange = trade.exchange as ExchangeId;
      const adapter = this.exchanges.get(exchange);
      const expectedSide = trade.direction === "LONG" ? "Long" : "Short";
      const exchangePosition = await adapter.getOpenPositions(trade.symbol)
        .then((positions) => positions.find((position) => position.symbol === trade.symbol && position.side === expectedSide))
        .catch(() => undefined);
      const quantity = exchangePosition?.size
        ?? calculateOrderQuantity(trade.positionSizeUsdt, trade.leverage, trade.entryPrice);
      premiumLog("execution", "close_order_submitting", {
        tradeId: trade.id,
        symbol: trade.symbol,
        exchange,
        strategyId: trade.strategyId,
        direction: trade.direction,
        quantity,
        reason,
      }, "info", "premium close order submitting");
      const result = await this.exchanges.placeOrder(exchange, {
        symbol: trade.symbol,
        side: trade.direction === "LONG" ? "Sell" : "Buy",
        orderType: "Market",
        qty: quantity,
        reduceOnly: true,
        clientOrderId: `close-${randomUUID()}`.slice(0, 36),
      });
      const exitPrice = result.avgFillPrice || trade.entryPrice;
      const grossPnl = trade.direction === "LONG"
        ? (exitPrice - trade.entryPrice) * quantity
        : (trade.entryPrice - exitPrice) * quantity;
      const pnlUsdt = grossPnl - (trade.feeUsdt ?? 0) - result.feeUsdt;
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          exitPrice,
          pnlUsdt,
          feeUsdt: (trade.feeUsdt ?? 0) + result.feeUsdt,
          closeReason: reason,
          closedAt: new Date(),
        },
      });
      await this.stateMachine.transition(trade.id, "CLOSED", reason, { exchangeOrderId: result.exchangeOrderId });
      premiumLog("execution", "order_closed", {
        tradeId: trade.id,
        symbol: trade.symbol,
        exchange,
        strategyId: trade.strategyId,
        exchangeOrderId: result.exchangeOrderId,
        exitPrice,
        grossPnl,
        pnlUsdt,
        feeUsdt: result.feeUsdt,
        quantity,
        reason,
      }, "info", "premium order closed");
    } catch (error) {
      await this.stateMachine.transition(trade.id, "ERROR", "Close order failed", { error: String(error) });
      premiumLog("execution", "close_order_failed", {
        tradeId: trade.id,
        symbol: trade.symbol,
        exchange: trade.exchange,
        strategyId: trade.strategyId,
        reason,
        error: serializeError(error),
      }, "error", "premium close order failed");
      throw error;
    }
  }
}
