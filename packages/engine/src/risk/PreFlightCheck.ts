import { prisma } from "@obsidra/shared";
import type { MarketDataStore } from "../data/MarketDataStore.js";
import type { BybitRestClient } from "../data/BybitRestClient.js";

export class PreFlightCheck {
  constructor(
    private readonly store: MarketDataStore,
    private readonly client: BybitRestClient,
    private readonly spreadMaxPct: number,
    private readonly paperTrading: boolean,
  ) {}

  async run(symbol: string): Promise<{ allowed: boolean; reason?: string }> {
    const book = this.store.getOrderbook();
    if (!book) return { allowed: false, reason: "Orderbook unavailable" };
    const spreadPct = ((book.ask - book.bid) / ((book.ask + book.bid) / 2)) * 100;
    if (spreadPct >= this.spreadMaxPct) return { allowed: false, reason: `Spread ${spreadPct.toFixed(4)}% too high` };
    const existing = await prisma.trade.findFirst({
      where: { symbol, status: { in: ["PENDING", "SUBMITTED", "OPEN", "PARTIALLY_FILLED", "FILLED", "CLOSING"] } },
    });
    if (existing) return { allowed: false, reason: "Open position already exists" };
    if (!this.paperTrading && Date.now() - this.client.getLastHeartbeat() > 30_000) {
      return { allowed: false, reason: "Bybit heartbeat stale" };
    }
    return { allowed: true };
  }
}
