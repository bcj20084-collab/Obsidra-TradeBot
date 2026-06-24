import type { Metrics } from "../lib/types";

const definitions: Array<[keyof Metrics, string, string]> = [
  ["winRate", "Win rate", "%"],
  ["profitFactor", "Profit factor", ""],
  ["sharpeRatio", "Sharpe", ""],
  ["maxDrawdown", "Max DD", "%"],
  ["tradesLast24h", "Trades 24h", ""],
  ["totalFeesPaidUsdt", "Fees", " USDT"],
];

export function MetricsCards({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {definitions.map(([key, label, suffix]) => (
        <div className="card" key={key}>
          <div className="label">{label}</div>
          <div className="mt-3 text-2xl font-bold tabular-nums">
            {typeof metrics[key] === "number" ? (metrics[key] as number).toFixed(key === "tradesLast24h" ? 0 : 2) : "—"}{suffix}
          </div>
        </div>
      ))}
    </div>
  );
}
