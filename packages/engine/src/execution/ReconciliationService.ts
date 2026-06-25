import { prisma, moduleLogger } from "@obsidra/shared";
import type { IExchangeAdapter } from "../exchanges/IExchangeAdapter.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";

const log = moduleLogger("ReconciliationService");

export class ReconciliationService {
  constructor(
    private readonly adapters: IExchangeAdapter[],
    private readonly journal: ExecutionJournal,
  ) {}

  async reconcile(symbol: string): Promise<void> {
    for (const adapter of this.adapters) {
      if (adapter.paperTrading) continue;
      const activeExchange = (await adapter.getOpenPositions(symbol)).filter((position) => position.size > 0);
      const local = await prisma.trade.findMany({
        where: { symbol, exchange: adapter.exchangeId, status: { in: ["OPEN", "FILLED", "CLOSING"] } },
      });
      for (const trade of local) {
        const expectedSide = trade.direction === "LONG" ? "Long" : "Short";
        const match = activeExchange.some((position) => position.symbol === trade.symbol && position.side === expectedSide);
        if (!match) {
          await prisma.trade.update({ where: { id: trade.id }, data: { status: "CLOSED", closedAt: new Date(), closeReason: "RECONCILIATION" } });
          await this.journal.record("RECONCILIATION_LOCAL_CLOSED", { exchange: adapter.exchangeId, reason: "Missing on exchange" }, trade.id);
        }
      }
      if (activeExchange.length > local.length) {
        log.error({ exchange: adapter.exchangeId, activeExchange: activeExchange.length, local: local.length }, "untracked exchange position detected");
        await this.journal.record("RECONCILIATION_UNTRACKED_POSITION", { exchange: adapter.exchangeId, positions: activeExchange });
      }
    }
  }
}
