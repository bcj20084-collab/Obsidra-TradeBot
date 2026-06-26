import { BadgeDollarSign, Clock3, Gauge, Percent, TrendingDown, Trophy } from "lucide-react";
import type { Metrics } from "../lib/types";

const definitions: Array<{
  key: keyof Metrics;
  label: string;
  suffix: string;
  icon: typeof Gauge;
  tone: "cyan" | "emerald" | "amber" | "rose" | "violet";
  digits?: number;
}> = [
  { key: "winRate", label: "Win rate", suffix: "%", icon: Trophy, tone: "emerald" },
  { key: "profitFactor", label: "Profit factor", suffix: "", icon: Percent, tone: "cyan" },
  { key: "sharpeRatio", label: "Sharpe", suffix: "", icon: Gauge, tone: "violet" },
  { key: "maxDrawdown", label: "Max drawdown", suffix: "%", icon: TrendingDown, tone: "rose" },
  { key: "tradesLast24h", label: "Trades 24h", suffix: "", icon: Clock3, tone: "amber", digits: 0 },
  { key: "totalFeesPaidUsdt", label: "Fees paid", suffix: " USDT", icon: BadgeDollarSign, tone: "cyan" },
];

export function MetricsCards({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {definitions.map(({ key, label, suffix, icon: Icon, tone, digits }) => {
        const raw = metrics[key];
        const value = typeof raw === "number" ? raw.toFixed(digits ?? 2) : "—";
        return (
          <div className="metric-card" key={key}>
            <div className={`metric-icon tone-${tone}`}><Icon size={18} /></div>
            <div className="mt-4 label">{label}</div>
            <div className="mt-2 text-2xl font-black tabular-nums text-white">{value}{suffix}</div>
          </div>
        );
      })}
    </div>
  );
}
