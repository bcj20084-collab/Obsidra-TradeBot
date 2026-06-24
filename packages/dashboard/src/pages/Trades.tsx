import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Trade } from "../lib/types";
import { TradeTable } from "../components/TradeTable";

export function Trades({ trades }: { trades: Trade[] }) {
  const [direction, setDirection] = useState("ALL");
  const filtered = useMemo(() => trades.filter((trade) => direction === "ALL" || trade.direction === direction), [trades, direction]);
  const exportCsv = () => {
    const csv = ["date,symbol,direction,entry,exit,pnl,fee,score", ...filtered.map((t) => [t.createdAt, t.symbol, t.direction, t.entryPrice, t.exitPrice, t.pnlUsdt, t.feeUsdt, t.signalScore].join(","))].join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = "obsidra-trades.csv";
    anchor.click();
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="label">Execution archive</div><h1 className="mt-2 text-3xl font-bold">Trades</h1></div>
        <div className="flex gap-2">
          <select className="input w-auto" value={direction} onChange={(event) => setDirection(event.target.value)}><option>ALL</option><option>LONG</option><option>SHORT</option></select>
          <button className="button flex items-center gap-2" onClick={exportCsv}><Download size={16} /> Export CSV</button>
        </div>
      </div>
      <div className="card"><TradeTable trades={filtered} /></div>
    </div>
  );
}
