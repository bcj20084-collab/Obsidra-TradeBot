import { operatorLog, prisma, moduleLogger } from "@obsidra/shared";
import type { IExchangeAdapter } from "../exchanges/IExchangeAdapter.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";
import type { ClosedTradeNotification } from "../monitoring/TelegramNotifier.js";

const log = moduleLogger("ReconciliationService");

export class ReconciliationService {
  private readonly lastExchangeWarningAt = new Map<string, number>();

  constructor(
    private readonly adapters: IExchangeAdapter[],
    private readonly journal: ExecutionJournal,
    private readonly onTradeClosed?: (trade: ClosedTradeNotification) => Promise<void>,
  ) {}

  async reconcile(symbol: string): Promise<void> {
    for (const adapter of this.adapters) {
      if (adapter.paperTrading) continue;
      try {
        const activeExchange = (await adapter.getOpenPositions(symbol)).filter((position) => position.size > 0);
        const local = await prisma.trade.findMany({
          where: { symbol, exchange: adapter.exchangeId, status: { in: ["OPEN", "FILLED", "CLOSING"] } },
        });
        for (const trade of local) {
          const expectedSide = trade.direction === "LONG" ? "Long" : "Short";
          const match = activeExchange.some((position) => position.symbol === trade.symbol && position.side === expectedSide);
          if (!match) {
            const closed = await adapter.getLatestClosedPosition?.(trade.symbol).catch(() => null);
            const belongsToTrade = closed
              && closed.side === expectedSide
              && (!trade.openedAt || closed.closedAt >= trade.openedAt.getTime());
            const exitPrice = belongsToTrade ? closed.exitPrice : trade.entryPrice ?? 0;
            const pnlUsdt = belongsToTrade ? closed.pnlUsdt : null;
            const pnlPct = pnlUsdt === null ? null : (pnlUsdt / Math.max(trade.positionSizeUsdt, Number.EPSILON)) * 100;
            const distanceToTp = Math.abs(exitPrice - trade.takeProfit);
            const distanceToSl = Math.abs(exitPrice - trade.stopLoss);
            const closeReason = belongsToTrade
              ? distanceToTp <= distanceToSl ? "RECONCILED_TP_LIKELY" : "RECONCILED_SL_LIKELY"
              : "RECONCILIATION";
            const closedAt = belongsToTrade ? new Date(closed.closedAt) : new Date();
            const closedMath = await this.journal.closeTrade({
              tradeId: trade.id,
              intendedPrice: trade.entryPrice ?? exitPrice,
              fillPrice: trade.entryPrice ?? exitPrice,
              exitPrice,
              closeReason,
              closedAt,
              feeUsdt: belongsToTrade ? closed.feeUsdt : trade.feeUsdt,
              pnlUsdt,
              pnlPct,
            });
            /*
             * closeTrade is now the single source of truth for the CLOSED update.
             * Keep this data shape here only as documentation of the old inline path:
             * {
                closedAt,
                closeReason,
                exitPrice: exitPrice || null,
                pnlUsdt,
                pnlPct,
                ...(belongsToTrade ? { feeUsdt: closed.feeUsdt } : {}),
             * }
             */
            await this.journal.record("RECONCILIATION_LOCAL_CLOSED", {
              exchange: adapter.exchangeId,
              reason: "Missing on exchange",
              closeReason,
              pnlUsdt,
            }, trade.id);
            operatorLog(
              pnlUsdt !== null && pnlUsdt >= 0 ? "INFO" : "WARNING",
              `${closeReason === "RECONCILED_TP_LIKELY" ? "TAKE PROFIT LIKELY" : closeReason === "RECONCILED_SL_LIKELY" ? "STOP LOSS LIKELY" : "RECONCILED"} | ${trade.symbol}`,
              `Exit: $${exitPrice.toFixed(4)} | PnL: ${pnlUsdt === null ? "unknown" : `${pnlUsdt >= 0 ? "+" : ""}${pnlUsdt.toFixed(2)} USDT`}`,
            );
            if (belongsToTrade && trade.entryPrice && pnlUsdt !== null && pnlPct !== null) {
              await this.onTradeClosed?.({
                exchange: adapter.exchangeId,
                symbol: trade.symbol,
                direction: trade.direction,
                entryPrice: trade.entryPrice,
                exitPrice,
                pnlUsdt,
                pnlPct,
                reason: closeReason,
                holdTimeMinutes: (closedMath.holdTimeSeconds ?? 0) / 60,
              });
            }
          }
        }
        if (activeExchange.length > local.length) {
          log.error({ exchange: adapter.exchangeId, activeExchange: activeExchange.length, local: local.length }, "untracked exchange position detected");
          await this.journal.record("RECONCILIATION_UNTRACKED_POSITION", { exchange: adapter.exchangeId, positions: activeExchange });
        }
      } catch (error) {
        const warningKey = adapter.exchangeId;
        const lastWarningAt = this.lastExchangeWarningAt.get(warningKey) ?? 0;
        if (Date.now() - lastWarningAt >= 15 * 60_000) {
          this.lastExchangeWarningAt.set(warningKey, Date.now());
          const reason = error instanceof Error ? error.message : String(error);
          operatorLog(
            "WARNING",
            `EXCHANGE UNAVAILABLE | ${adapter.exchangeId.toUpperCase()}`,
            `${reason} | retrying in background`,
          );
        }
      }
    }
  }
}
