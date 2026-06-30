import type { Direction } from "@obsidra/shared";

export type LossCategory =
  | "STOP_LOSS_HIT"
  | "TRAILING_STOP"
  | "TIMEOUT_EXIT"
  | "LOW_CONFIDENCE"
  | "FEE_DRAG"
  | "COUNTER_TREND"
  | "STOP_TOO_TIGHT"
  | "FAST_REVERSAL"
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

export interface AdaptiveLossAction {
  action: "increase_score_threshold" | "extend_symbol_cooldown" | "reduce_size" | "review_stop_distance";
  severity: "LOW" | "MEDIUM" | "HIGH";
  value: number;
  reason: string;
}

export interface LossAnalysis {
  primaryCategory: LossCategory;
  secondaryCategories: LossCategory[];
  confidence: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  recommendations: string[];
  adaptiveActions: AdaptiveLossAction[];
  suggestedScorePenalty: number;
  suggestedCooldownMinutes: number;
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
  const holdMinutes = (input.holdTimeSeconds ?? 0) / 60;
  const stopDistancePct = Math.abs(input.entryPrice - input.stopLoss) / Math.max(input.entryPrice, Number.EPSILON) * 100;
  const rewardDistance = Math.abs(input.takeProfit - input.entryPrice);
  const riskDistance = Math.abs(input.entryPrice - input.stopLoss);
  const riskReward = rewardDistance / Math.max(riskDistance, Number.EPSILON);
  if (primary === "STOP_LOSS_HIT" && stopDistancePct < 0.35) secondary.add("STOP_TOO_TIGHT");
  if (primary === "STOP_LOSS_HIT" && holdMinutes > 0 && holdMinutes <= 12) secondary.add("FAST_REVERSAL");

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
  if (secondary.has("STOP_TOO_TIGHT")) recommendations.push("Stop was tight relative to entry; require stronger score or wider ATR stop before next entry.");
  if (secondary.has("FAST_REVERSAL")) recommendations.push("Loss happened quickly; add cooldown and avoid immediate re-entry on the same symbol.");
  if (riskReward < 1.8) recommendations.push("Risk/reward was marginal; prefer setups above 1.8R after a loss streak.");

  const severity = input.pnlPct <= -3 || secondary.has("FAST_REVERSAL")
    ? "HIGH"
    : input.pnlPct <= -1.5 || secondary.size >= 2
      ? "MEDIUM"
      : "LOW";
  const suggestedScorePenalty = severity === "HIGH" ? 8 : severity === "MEDIUM" ? 5 : 2;
  const suggestedCooldownMinutes = severity === "HIGH" ? 90 : severity === "MEDIUM" ? 45 : 20;
  const adaptiveActions: AdaptiveLossAction[] = [
    {
      action: "increase_score_threshold",
      severity,
      value: suggestedScorePenalty,
      reason: "Require a stronger signal after a losing setup.",
    },
    {
      action: "extend_symbol_cooldown",
      severity,
      value: suggestedCooldownMinutes,
      reason: "Avoid immediate re-entry while the same market structure may still be active.",
    },
  ];
  if (secondary.has("STOP_TOO_TIGHT")) {
    adaptiveActions.push({
      action: "review_stop_distance",
      severity: "MEDIUM",
      value: Number(stopDistancePct.toFixed(3)),
      reason: "Stop distance was narrow compared with recent volatility.",
    });
  }
  if (severity === "HIGH") {
    adaptiveActions.push({
      action: "reduce_size",
      severity,
      value: 0.5,
      reason: "Use half-sized exploration on the next comparable setup.",
    });
  }

  const summary = [
    `${input.symbol} ${input.direction} loss ${input.pnlUsdt.toFixed(2)} USDT (${input.pnlPct.toFixed(2)}%)`,
    `reason=${input.closeReason}`,
    `score=${input.signalScore}`,
    input.marketRegime ? `regime=${input.marketRegime}` : "",
    `category=${primary}`,
    `severity=${severity}`,
  ].filter(Boolean).join(" | ");

  return {
    primaryCategory: primary,
    secondaryCategories: [...secondary],
    confidence,
    severity,
    summary,
    recommendations,
    adaptiveActions,
    suggestedScorePenalty,
    suggestedCooldownMinutes,
  };
}
