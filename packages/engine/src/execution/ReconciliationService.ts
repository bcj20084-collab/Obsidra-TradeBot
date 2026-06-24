import { prisma, moduleLogger } from "@obsidra/shared";
import type { BybitRestClient } from "../data/BybitRestClient.js";
import type { ExecutionJournal } from "./ExecutionJournal.js";

const log = moduleLogger("ReconciliationService");

export class ReconciliationService {
  constructor(
    private readonly client: BybitRestClient,
    private readonly journal: ExecutionJournal,
  ) {}

  async reconcile(symbol: string): Promise<void> {
    const exchange = await this.client.getOpenPositions(symbol);
    const activeExchange = exchange.filter((position) => Number(position.size ?? 0) > 0);
    const local = await prisma.trade.findMany({ where: { symbol, status: { in: ["OPEN", "FILLED", "CLOSING"] } } });
    for (const trade of local) {
      const match = activeExchange.some((position) => position.symbol === trade.symbol);
      if (!match) {
        await prisma.trade.update({ where: { id: trade.id }, data: { status: "CLOSED", closedAt: new Date() } });
        await this.journal.record("RECONCILIATION_LOCAL_CLOSED", { reason: "Missing on exchange" }, trade.id);
      }
    }
    if (activeExchange.length > local.length) {
      log.error({ activeExchange: activeExchange.length, local: local.length }, "untracked exchange position detected");
      await this.journal.record("RECONCILIATION_UNTRACKED_POSITION", { positions: activeExchange });
    }
  }
}
