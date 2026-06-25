import type { ExchangeId, IExchangeAdapter, OrderParams } from "./IExchangeAdapter.js";

export class ExchangeRouter {
  private readonly adapters = new Map<ExchangeId, IExchangeAdapter>();
  constructor(adapters: IExchangeAdapter[]) { for (const adapter of adapters) this.adapters.set(adapter.exchangeId, adapter); }
  get(exchange: ExchangeId): IExchangeAdapter {
    const adapter = this.adapters.get(exchange);
    if (!adapter) throw new Error(`Exchange ${exchange} is not configured`);
    return adapter;
  }
  async placeOrder(exchange: ExchangeId, params: OrderParams) {
    // Routing is deterministic. Retrying on a second exchange after an ambiguous timeout can duplicate exposure.
    return this.get(exchange).placeOrder(params);
  }
}
