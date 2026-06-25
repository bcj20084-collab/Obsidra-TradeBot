import type { StrategyConfig, IStrategy } from "./IStrategy.js";
import { TrendStrategy } from "./trend/TrendStrategy.js";
import { GridStrategy } from "./grid/GridStrategy.js";
import { DCAStrategy } from "./dca/DCAStrategy.js";
import { ScalpStrategy } from "./scalp/ScalpStrategy.js";
import { CopyTradingStrategy } from "./copy/CopyTradingStrategy.js";

export function createStrategy(config: StrategyConfig): IStrategy {
  switch (config.type) {
    case "TREND": return new TrendStrategy(config);
    case "GRID": return new GridStrategy(config);
    case "DCA": return new DCAStrategy(config);
    case "SCALP": return new ScalpStrategy(config);
    case "COPY": return new CopyTradingStrategy(config);
  }
}
