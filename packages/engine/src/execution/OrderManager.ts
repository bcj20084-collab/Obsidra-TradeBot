import { randomUUID } from "node:crypto";
import { operatorLog, premiumLog, prisma, type SignalResult } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";
import type { ExchangeRouter } from "../exchanges/ExchangeRouter.js";
import type { RiskDecision } from "../risk/RiskEngine.js";
import { sideFor } from "../risk/RiskEngine.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";
import type { OrderStateMachine } from "./OrderStateMachine.js";
import { calculateOrderQuantity } from "./ExecutionMath.js";
import type { ClosedTradeNotification } from "../monitoring/TelegramNotifier.js";
import { analyzeClosedTrade } from "../analysis/TradeAnalyzer.js";

function serializeError(error: unknown): unknown {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return String(error);
}

function paperProtectionFrom(signalData: unknown): { initialPositionSizeUsdt?: number; partialRealizedPnlUsdt?: number; partialFeeUsdt?: number } {
  if (!signalData || typeof signalData !== "object") return {};
  const protection = (signalData as Record<string, unknown>).paperProtection;
  if (!protection || typeof protection !== "object") return {};
  return protection as { initialPositionSizeUsdt?: number; partialRealizedPnlUsdt?: number; partialFeeUsdt?: number };
}

function jsonValue(value: unknown): never {
  return JSON.parse(JSON.stringify(value)) as never;
}

export class OrderManager {
  constructor(
    private readonly exchanges: ExchangeRouter,
    private readonly stateMachine: OrderStateMachine,
    private readonly journal: ExecutionJournal,
    private readonly onTradeClosed?: (trade: ClosedTradeNotification) => Promise<void>,
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
      operatorLog(
        "INFO",
        `${signal.direction === "LONG" ? "BUY" : "SELL"} | ${symbol}`,
        `Entry: $${(result.avgFillPrice || signal.entryPrice).toFixed(4)} | SL: $${risk.stopLossPrice.toFixed(4)} | TP: $${risk.takeProfitPrice.toFixed(4)} | Size: ${risk.positionSizeUsdt.toFixed(2)} USDT | ${risk.leverage}x`,
      );
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
      const paperProtection = paperProtectionFrom(trade.signalData);
      const partialRealizedPnlUsdt = paperProtection.partialRealizedPnlUsdt ?? 0;
      const feesAlreadyAppliedToPartialPnl = paperProtection.partialFeeUsdt ?? 0;
      const remainingFeesUsdt = Math.max(0, (trade.feeUsdt ?? 0) - feesAlreadyAppliedToPartialPnl) + result.feeUsdt;
      const pnlUsdt = partialRealizedPnlUsdt + grossPnl - remainingFeesUsdt;
      const initialPositionSizeUsdt = paperProtection.initialPositionSizeUsdt ?? trade.positionSizeUsdt;
      const pnlPct = (pnlUsdt / Math.max(initialPositionSizeUsdt, Number.EPSILON)) * 100;
      const holdTimeSeconds = trade.openedAt ? Math.max(0, Math.round((Date.now() - trade.openedAt.getTime()) / 1_000)) : 0;
      await prisma.trade.update({
        where: { id: trade.id },
        data: {
          exitPrice,
          pnlUsdt,
          pnlPct,
          feeUsdt: (trade.feeUsdt ?? 0) + result.feeUsdt,
          closeReason: reason,
          holdTimeSeconds,
          closedAt: new Date(),
        },
      });
      await this.stateMachine.transition(trade.id, "CLOSED", reason, { exchangeOrderId: result.exchangeOrderId });
      const lossAnalysis = analyzeClosedTrade({
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        pnlUsdt,
        pnlPct,
        feeUsdt: (trade.feeUsdt ?? 0) + result.feeUsdt,
        closeReason: reason,
        signalScore: trade.signalScore,
        marketRegime: trade.marketRegime,
        holdTimeSeconds,
      });
      if (lossAnalysis) {
        await this.journal.record("TRADE_LOSS_ANALYZED", lossAnalysis as unknown as Record<string, unknown>, trade.id);
        await prisma.botEvent.create({
          data: {
            type: "TRADE_LOSS_ANALYZED",
            symbol: trade.symbol,
            message: lossAnalysis.summary,
            data: jsonValue(lossAnalysis),
          },
        });
      }
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
        lossAnalysis,
      }, "info", "premium order closed");
      operatorLog(
        pnlUsdt >= 0 ? "INFO" : "WARNING",
        `${pnlUsdt >= 0 ? "TAKE PROFIT" : "CLOSE"} | ${trade.symbol}`,
        `Exit: $${exitPrice.toFixed(4)} | PnL: ${pnlUsdt >= 0 ? "+" : ""}${pnlUsdt.toFixed(2)} USDT (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%) | Reason: ${reason}`,
      );
      await this.onTradeClosed?.({
        exchange,
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        exitPrice,
        pnlUsdt,
        pnlPct,
        reason,
        holdTimeMinutes: holdTimeSeconds / 60,
      });
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
