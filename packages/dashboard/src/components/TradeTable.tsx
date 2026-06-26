import type { CSSProperties } from "react";
import type { Trade } from "../lib/types";

export function TradeTable({
  trades,
  compact = false,
  onSelect,
}: {
  trades: Trade[];
  compact?: boolean;
  onSelect?: (trade: Trade) => void;
}) {
  if (!trades.length) {
    return (
      <div className="empty-state">
        <div className="text-lg font-bold text-white">No trades yet</div>
        <p className="mt-2 text-sm text-slate-400">The execution tape will populate after the next simulated signal passes risk checks.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-sm ${compact ? "min-w-[860px]" : "min-w-[1040px]"}`}>
        <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
          <tr>
            {["Time", "Market", "Mode", "Direction", "Entry", "Exit", "SL / TP", "PnL", "Score", "Hold", "Status"].map((item) => (
              <th className="px-3 py-3 font-semibold" key={item}>{item}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr
              className={`group border-t border-white/10 transition hover:bg-white/[0.03] ${onSelect ? "cursor-pointer" : ""}`}
              key={trade.id}
              onClick={() => onSelect?.(trade)}
            >
              <td className="px-3 py-4 text-slate-400">{new Date(trade.createdAt).toLocaleString()}</td>
              <td className="px-3 py-4">
                <div className="font-black text-white">{trade.symbol}</div>
                <div className="text-xs uppercase tracking-wider text-slate-500">{trade.exchange} / {trade.strategyId}</div>
              </td>
              <td className="px-3 py-4"><span className="pill">{trade.executionMode ?? "Paper"}</span></td>
              <td className="px-3 py-4">
                <span className={`direction-badge ${trade.direction === "LONG" ? "direction-long" : "direction-short"}`}>{trade.direction}</span>
              </td>
              <td className="px-3 py-4 font-mono">{format(trade.entryPrice)}</td>
              <td className="px-3 py-4 font-mono">{format(trade.exitPrice)}</td>
              <td className="px-3 py-4 font-mono text-xs text-slate-300">{format(trade.stopLoss)} / {format(trade.takeProfit)}</td>
              <td className={`px-3 py-4 font-mono font-black ${(trade.pnlUsdt ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {format(trade.pnlUsdt)}
              </td>
              <td className="px-3 py-4">
                <div className="score-ring" style={{ "--score": `${Math.min(100, Math.max(0, trade.signalScore))}%` } as CSSProperties}>
                  {trade.signalScore}
                </div>
              </td>
              <td className="px-3 py-4 text-slate-300">{trade.holdTimeSeconds == null ? "-" : `${Math.round(trade.holdTimeSeconds / 60)}m`}</td>
              <td className="px-3 py-4"><span className="pill">{trade.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function format(value: number | null): string {
  return value == null ? "-" : value.toFixed(Math.abs(value) >= 100 ? 2 : 4);
}
