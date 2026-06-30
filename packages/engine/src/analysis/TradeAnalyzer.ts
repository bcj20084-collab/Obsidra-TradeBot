import type { Direction } from "@obsidra/shared";

export type LossCategory =
  | "STOP_LOSS_HIT"
  | "TRAILING_STOP"
  | "TIMEOUT_EXIT"
  | "LOW_CONFIDENCE"
  | "FEE_DRAG"
  | "COUNTER_TREND"
  | "UNKNOWN";

export interface ClosedTradeAnalysisInput {
  symbol: string;
  direction: Direction | string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnlUsdt: number;
  pnlPct: number;
  feeUsdt: number;
  closeReason: string;
  signalScore: number;
  marketRegime?: string | null;
  holdTimeSeconds?: number | null;
}

export interface LossAnalysis {
  primaryCategory: LossCategory;
  secondaryCategories: LossCategory[];
  confidence: number;
  summary: string;
  recommendations: string[];
}

export function analyzeClosedTrade(input: ClosedTradeAnalysisInput): LossAnalysis | null {
  if (input.pnlUsdt >= 0) return null;

  const reason = input.closeReason.toLowerCase();
  const secondary = new Set<LossCategory>();
  let primary: LossCategory = "UNKNOWN";
  let confidence = 0.45;

  if (reason.includes("stop")) {
    primary = reason.includes("trail") ? "TRAILING_STOP" : "STOP_LOSS_HIT";
    confidence = 0.9;
  } else if (reason.includes("timeout") || reason.includes("max_hold")) {
    primary = "TIMEOUT_EXIT";
    confidence = 0.85;
  }

  if (input.signalScore < 65) secondary.add("LOW_CONFIDENCE");
  if (input.marketRegime === "RANGING" && !reason.includes("take_profit")) secondary.add("COUNTER_TREND");
  if (Math.abs(input.pnlUsdt) > 0 && input.feeUsdt / Math.abs(input.pnlUsdt) >= 0.3) secondary.add("FEE_DRAG");

  if (secondary.has("LOW_CONFIDENCE") && primary === "UNKNOWN") {
    primary = "LOW_CONFIDENCE";
    confidence = 0.75;
  }

  const recommendations: string[] = [];
  if (primary === "STOP_LOSS_HIT") recommendations.push("Review SL distance; if repeated, widen ATR stop or wait for cleaner pullback.");
  if (primary === "TRAILING_STOP") recommendations.push("Trailing protected the trade; check if activation is too early for this symbol.");
  if (primary === "TIMEOUT_EXIT") recommendations.push("Trade lost momentum; consider shorter max hold or stronger entry confirmation.");
  if (secondary.has("LOW_CONFIDENCE")) recommendations.push("Raise confidence threshold for this symbol until recent win rate improves.");
  if (secondary.has("FEE_DRAG")) recommendations.push("Avoid small edge trades where fees consume a large part of expected profit.");
  if (secondary.has("COUNTER_TREND")) recommendations.push("Reduce size or block entries when regime is ranging/counter-trend.");

  const summary = [
    `${input.symbol} ${input.direction} loss ${input.pnlUsdt.toFixed(2)} USDT (${input.pnlPct.toFixed(2)}%)`,
    `reason=${input.closeReason}`,
    `score=${input.signalScore}`,
    input.marketRegime ? `regime=${input.marketRegime}` : "",
    `category=${primary}`,
  ].filter(Boolean).join(" | ");

  return {
    primaryCategory: primary,
    secondaryCategories: [...secondary],
    confidence,
    summary,
    recommendations,
  };
}
