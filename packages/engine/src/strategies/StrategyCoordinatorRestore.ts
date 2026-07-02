import type { Direction, StrategyDescriptor } from "@obsidra/shared";
import type { ExchangeId } from "../exchanges/IExchangeAdapter.js";
import type { StrategyCoordinator } from "./StrategyCoordinator.js";

export interface RestorableTrade {
  id: string;
  exchange: string;
  symbol: string;
  strategyId: string;
  direction: string;
  positionSizeUsdt: number;
}

export interface RestorableGridLevel {
  exchange: string;
  symbol: string;
  strategyId: string;
  orderSizeUsdt: number;
}

export interface RestorableDcaPosition {
  exchange: string;
  symbol: string;
  strategyId: string;
  direction: string;
  totalInvestedUsdt: number;
}

export function restoreStrategyCoordinator(params: {
  coordinator: StrategyCoordinator;
  descriptors: StrategyDescriptor[];
  openTrades: RestorableTrade[];
  gridLevels: RestorableGridLevel[];
  dcaPositions: RestorableDcaPosition[];
  watchTradeClose?: (trade: RestorableTrade) => void;
}): void {
  const { coordinator, descriptors, openTrades, gridLevels, dcaPositions, watchTradeClose } = params;
  for (const trade of openTrades) {
    const descriptor = descriptors.find((item) => item.id === trade.strategyId);
    coordinator.open(trade.exchange as ExchangeId, trade.symbol, {
      strategyId: trade.strategyId,
      type: descriptor?.type ?? "TREND",
      direction: trade.direction as Direction,
      sizeUsdt: trade.positionSizeUsdt,
    });
    if (["TREND", "PULLBACK"].includes(descriptor?.type ?? "TREND")) watchTradeClose?.(trade);
  }
  for (const descriptor of descriptors.filter((item) => item.type === "GRID")) {
    const exposure = gridLevels.filter((level) => level.strategyId === descriptor.id).reduce((sum, level) => sum + level.orderSizeUsdt, 0);
    if (exposure > 0) {
      coordinator.open(descriptor.exchange, descriptor.symbol, { strategyId: descriptor.id, type: "GRID", direction: "LONG", sizeUsdt: exposure });
    }
  }
  for (const position of dcaPositions) {
    coordinator.open(position.exchange as ExchangeId, position.symbol, {
      strategyId: position.strategyId,
      type: "DCA",
      direction: position.direction as Direction,
      sizeUsdt: position.totalInvestedUsdt,
    });
  }
}
