import { prisma } from "@obsidra/shared";
import type { ExchangeId, IExchangeAdapter } from "../exchanges/IExchangeAdapter.js";

export class PreFlightCheck {
  constructor(
    private readonly adapter: IExchangeAdapter,
    private readonly spreadMaxPct: number,
  ) {}

  async run(symbol: string): Promise<{ allowed: boolean; reason?: string }> {
    let book: { bid: number; ask: number };
    try {
      book = await this.adapter.getBestBidAsk(symbol);
    } catch {
      return { allowed: false, reason: `${this.adapter.exchangeId} orderbook unavailable` };
    }
    if (!Number.isFinite(book.bid) || !Number.isFinite(book.ask) || book.bid <= 0 || book.ask <= 0) {
      return { allowed: false, reason: "Invalid orderbook" };
    }
    const spreadPct = ((book.ask - book.bid) / ((book.ask + book.bid) / 2)) * 100;
    if (spreadPct >= this.spreadMaxPct) return { allowed: false, reason: `Spread ${spreadPct.toFixed(4)}% too high` };
    const existing = await prisma.trade.findFirst({
      where: {
        symbol,
        exchange: this.adapter.exchangeId satisfies ExchangeId,
        status: { in: ["PENDING", "SUBMITTED", "OPEN", "PARTIALLY_FILLED", "FILLED", "CLOSING"] },
      },
    });
    if (existing) return { allowed: false, reason: "Open position already exists" };
    if (!this.adapter.paperTrading) {
      try {
        if (await this.adapter.ping() > 2_000) return { allowed: false, reason: `${this.adapter.exchangeId} latency too high` };
      } catch {
        return { allowed: false, reason: `${this.adapter.exchangeId} unavailable` };
      }
    }
    return { allowed: true };
  }
}
