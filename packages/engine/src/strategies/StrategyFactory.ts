import type { StrategyConfig, IStrategy } from "./IStrategy.js";
import { TrendStrategy } from "./trend/TrendStrategy.js";
import { GridStrategy } from "./grid/GridStrategy.js";
import { DCAStrategy } from "./dca/DCAStrategy.js";
import { ScalpStrategy } from "./scalp/ScalpStrategy.js";
import { CopyTradingStrategy } from "./copy/CopyTradingStrategy.js";
import type { ExchangeRouter } from "../exchanges/ExchangeRouter.js";
import type { MarketDataStore } from "../data/MarketDataStore.js";
import type { OrderManager } from "../execution/OrderManager.js";
import type { ExecutionJournal } from "../execution/ExecutionJournal.js";
import type { RiskEngine } from "../risk/RiskEngine.js";
import type { Direction } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";

export interface StrategyDependencies {
  exchanges: ExchangeRouter;
  storeFor(exchange: ExchangeId): MarketDataStore;
  orderManager: OrderManager;
  journal: ExecutionJournal;
  riskForSymbol(symbol: string, exchange: StrategyConfig["exchange"]): RiskEngine | undefined;
  approveOrder(config: StrategyConfig, direction: Direction, sizeUsdt: number, symbol?: string): Promise<{ approved: boolean; reason?: string }>;
  registerOpen(config: StrategyConfig, direction: Direction, sizeUsdt: number, symbol?: string): void;
  unregisterOpen(config: StrategyConfig, symbol?: string): void;
  onTrendCandle?(symbol: string, exchange: ExchangeId): Promise<void>;
}

export function createStrategy(config: StrategyConfig, dependencies: StrategyDependencies): IStrategy {
  switch (config.type) {
    case "TREND": return new TrendStrategy(config, dependencies.onTrendCandle);
    case "GRID": return new GridStrategy(config, dependencies.exchanges, dependencies);
    case "DCA": return new DCAStrategy(config, dependencies.exchanges, dependencies);
    case "SCALP": return new ScalpStrategy(config, dependencies);
    case "COPY": return new CopyTradingStrategy(config, dependencies);
  }
}
