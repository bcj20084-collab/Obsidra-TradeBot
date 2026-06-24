import type { Candle, Direction } from "@obsidra/shared";

export interface BacktestPosition {
  symbol: string;
  direction: Direction;
  entryTime: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  positionSizeUsdt: number;
  leverage: number;
  commission: number;
  slippage: number;
}

export interface BacktestFill {
  symbol: string;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  reason: "SL" | "TP" | "END";
  holdTimeMinutes: number;
  riskRewardRatio: number;
}

export class BacktestExecutor {
  openMarket(params: {
    symbol: string;
    direction: Direction;
    candle: Candle;
    stopLoss: number;
    takeProfit: number;
    positionSizeUsdt: number;
    leverage: number;
    commission: number;
    slippage: number;
  }): BacktestPosition {
    const entry = params.candle.open * (params.direction === "LONG" ? 1 + params.slippage : 1 - params.slippage);
    return {
      symbol: params.symbol,
      direction: params.direction,
      entryTime: params.candle.openTime,
      entry,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      positionSizeUsdt: params.positionSizeUsdt,
      leverage: params.leverage,
      commission: params.commission,
      slippage: params.slippage,
    };
  }

  closeOnCandle(position: BacktestPosition, candle: Candle, forceEnd = false): BacktestFill | null {
    const stopHit = position.direction === "LONG" ? candle.low <= position.stopLoss : candle.high >= position.stopLoss;
    const targetHit = position.direction === "LONG" ? candle.high >= position.takeProfit : candle.low <= position.takeProfit;

    if (!stopHit && !targetHit && !forceEnd) return null;

    const reason: "SL" | "TP" | "END" = stopHit ? "SL" : targetHit ? "TP" : "END";
    const requestedExit = reason === "SL" ? position.stopLoss : reason === "TP" ? position.takeProfit : candle.close;
    const gapThroughStop = reason === "SL" && (position.direction === "LONG" ? candle.open < position.stopLoss : candle.open > position.stopLoss);
    const exit = gapThroughStop ? candle.open : requestedExit;
    const priceMovePct = position.direction === "LONG"
      ? (exit - position.entry) / position.entry
      : (position.entry - exit) / position.entry;
    const notional = position.positionSizeUsdt * position.leverage;
    const grossPnl = priceMovePct * notional;
    const fees = notional * position.commission * 2;
    const pnl = grossPnl - fees;
    const risk = Math.abs(position.entry - position.stopLoss);
    const reward = Math.abs(position.takeProfit - position.entry);

    return {
      symbol: position.symbol,
      direction: position.direction,
      entryTime: position.entryTime,
      exitTime: candle.closeTime,
      entry: position.entry,
      exit,
      pnl,
      pnlPct: (pnl / Math.max(position.positionSizeUsdt, Number.EPSILON)) * 100,
      fees,
      reason,
      holdTimeMinutes: Math.max(0, Math.round((candle.closeTime - position.entryTime) / 60_000)),
      riskRewardRatio: reward / Math.max(risk, Number.EPSILON),
    };
  }
}
