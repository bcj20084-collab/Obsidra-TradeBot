import type { Trade } from "../lib/types";

export function TradeTable({ trades }: { trades: Trade[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-500">
          <tr>{["Date", "Symbol", "Dir", "Entry", "Exit", "SL", "TP", "PnL", "Fee", "Slippage", "Score", "Hold"].map((item) => <th className="px-3 py-3" key={item}>{item}</th>)}</tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr className="border-t border-border/70" key={trade.id}>
              <td className="px-3 py-3 text-slate-400">{new Date(trade.createdAt).toLocaleString()}</td>
              <td className="px-3 py-3 font-semibold">{trade.symbol}</td>
              <td className={`px-3 py-3 font-semibold ${trade.direction === "LONG" ? "text-emerald-400" : "text-rose-400"}`}>{trade.direction}</td>
              <td className="px-3 py-3">{format(trade.entryPrice)}</td>
              <td className="px-3 py-3">{format(trade.exitPrice)}</td>
              <td className="px-3 py-3">{format(trade.stopLoss)}</td>
              <td className="px-3 py-3">{format(trade.takeProfit)}</td>
              <td className={`px-3 py-3 font-semibold ${(trade.pnlUsdt ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{format(trade.pnlUsdt)}</td>
              <td className="px-3 py-3">{format(trade.feeUsdt)}</td>
              <td className="px-3 py-3">{trade.slippage == null ? "—" : `${(trade.slippage * 100).toFixed(3)}%`}</td>
              <td className="px-3 py-3">{trade.signalScore}</td>
              <td className="px-3 py-3">{trade.holdTimeSeconds == null ? "—" : `${Math.round(trade.holdTimeSeconds / 60)}m`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function format(value: number | null): string {
  return value == null ? "—" : value.toFixed(2);
}
